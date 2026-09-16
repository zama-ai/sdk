import { getAddress, type Address, type Hex } from "viem";
import { confidentialTransferAndCallContract } from "../contracts";
import {
  ConfigurationError,
  EncryptionFailedError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import type { EncryptedValue } from "../relayer/types";
import type { TransactionResult, WriteContractConfig } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import type { ZamaSDK } from "../zama-sdk";
import { encodeAllocationData, type AllocationLeg } from "./allocation";
import {
  normalizeBatcherHistory,
  resolveActiveBatcher,
  type BatcherDirection,
  type BatcherHistory,
} from "./batcher-history";
import { findJoined } from "./events";
import { VaultRouter } from "./vault-router";

/**
 * The FHE compute a submission may use is capped per transaction, and a router
 * join spends it per leg. Eight legs is what fits.
 */
export const MAX_GROUP_VAULTS = 8;

/** One vault of a group. */
export interface VaultMemberConfig {
  /** Stable identifier the caller uses to pick this vault. */
  readonly id: string;
  /** The ERC-4626 vault contract. */
  readonly vault: Address;
  /** The confidential wrapper of this vault's shares. */
  readonly share: Address;
  readonly batchers: Readonly<Record<BatcherDirection, BatcherHistory>>;
}

/** A set of vaults that share one confidential asset and are joined together. */
export interface VaultGroupConfig {
  /** Stable identifier for the group. */
  readonly id: string;
  /** The confidential asset every member takes deposits in. */
  readonly asset: Address;
  /** The members, in the order their legs are submitted. */
  readonly vaults: readonly VaultMemberConfig[];
  /** The fan-out router. Required for a group of more than one vault. */
  readonly router?: Address;
}

/** How a group submission is packaged. */
export type VaultGroupStrategy = "auto" | "router" | "direct";

/** Options for {@link VaultGroup.deposit} and {@link VaultGroup.requestWithdrawal}. */
export interface VaultGroupJoinOptions {
  /**
   * Unix timestamp until which an operator grant made for this submission is
   * valid. Defaults to `Token.setOperator`'s own default.
   */
  operatorDeadline?: number;
  /**
   * `"auto"` (the default) uses the router for a group of more than one vault
   * and a direct transfer for a group of one.
   *
   * `"direct"` submits one transfer per leg instead, for callers that can batch
   * them atomically (EIP-5792, smart accounts). It changes how the legs are
   * packaged and nothing about what they are.
   */
  strategy?: VaultGroupStrategy;
}

/** What one leg's batcher reported. */
export interface VaultGroupJoin {
  vaultId: string;
  /** The batcher it reached, as resolved at submission time. */
  batcher: Address;
  /** The batch the join landed in. */
  batchId: bigint;
  /**
   * The encrypted amount credited. Zero for every leg but the chosen one — and
   * possibly zero for that one too, since an ERC-7984 transfer moves nothing
   * rather than reverting when the balance is short.
   */
  confidentialJoinedAmount: EncryptedValue;
}

/** The outcome of one group deposit or withdrawal request. */
export interface VaultGroupJoinResult {
  /** The member the caller chose. */
  vaultId: string;
  /** One transaction on the router path, one per leg on the direct path. */
  transactions: readonly TransactionResult[];
  /** One entry per leg, in group order. */
  joins: readonly VaultGroupJoin[];
}

/** A leg tagged with the member it belongs to; the router reads only what it inherits. */
interface GroupLeg extends AllocationLeg {
  readonly vaultId: string;
}

function duplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.toLowerCase())) {
      return value;
    }
    seen.add(value.toLowerCase());
  }
  return undefined;
}

/**
 * A set of vaults that take deposits in the same confidential asset, joined as
 * one.
 *
 * A deposit into one member joins *every* member's batch: the chosen vault
 * carries the amount, the rest carry an encrypted zero. Callers should expect a
 * batch position on every member, not only the one they picked.
 *
 * This is the surface product code should reach for; a single-vault group is
 * the degenerate case and needs no router.
 */
export class VaultGroup {
  /** The SDK instance this group reads and writes through. */
  readonly sdk: ZamaSDK;
  readonly id: string;
  /** The confidential asset every member takes deposits in. */
  readonly asset: Address;
  /** The members, in leg order. */
  readonly vaults: readonly VaultMemberConfig[];
  /** The fan-out router, absent for a single-vault group. */
  readonly router: VaultRouter | undefined;

  constructor(sdk: ZamaSDK, config: VaultGroupConfig) {
    if (config.vaults.length === 0) {
      throw new ConfigurationError(`Vault group "${config.id}" names no vaults`);
    }
    if (config.vaults.length > MAX_GROUP_VAULTS) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vaults, above the ${MAX_GROUP_VAULTS} a submission can carry`,
      );
    }
    const duplicateId = duplicate(config.vaults.map((member) => member.id));
    if (duplicateId !== undefined) {
      throw new ConfigurationError(`Vault group "${config.id}" names "${duplicateId}" twice`);
    }
    const duplicateShare = duplicate(config.vaults.map((member) => member.share));
    if (duplicateShare !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateShare} as the share token of more than one vault`,
      );
    }
    if (config.vaults.length > 1 && config.router === undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vaults but no router to reach them in one transaction`,
      );
    }

    this.sdk = sdk;
    this.id = config.id;
    this.asset = getAddress(config.asset);
    this.vaults = config.vaults.map((member) => ({
      id: member.id,
      vault: getAddress(member.vault),
      share: getAddress(member.share),
      batchers: {
        deposit: normalizeBatcherHistory(member.batchers.deposit),
        redeem: normalizeBatcherHistory(member.batchers.redeem),
      },
    }));
    this.router = config.router ? new VaultRouter(sdk, config.router) : undefined;
  }

  member(vaultId: string): VaultMemberConfig {
    const member = this.vaults.find((candidate) => candidate.id === vaultId);
    if (!member) {
      throw new ConfigurationError(`Vault group "${this.id}" has no vault "${vaultId}"`);
    }
    return member;
  }

  /**
   * The batcher each member's next join in `direction` would reach, keyed by
   * member id. Read before every submission: the answer moves when a retired
   * batcher's last batch is dispatched.
   */
  async activeBatchers(direction: BatcherDirection): Promise<Readonly<Record<string, Address>>> {
    const entries = await Promise.all(
      this.vaults.map(
        async (member) =>
          [member.id, await resolveActiveBatcher(this.sdk, member.batchers[direction])] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  /**
   * Deposit the confidential asset into one member of the group, joining every
   * member's current deposit batch.
   *
   * @param vaultId - The member to deposit into.
   * @param amount - The plaintext amount; encrypted before submission.
   * @param options - Optional `operatorDeadline` and `strategy`.
   *
   * @remarks
   * Unlike `Vault.deposit` there is no `beneficiary`: every contract on this
   * path credits whoever the transfer came from, so a group deposit cannot be
   * made on someone else's behalf.
   */
  async deposit(
    vaultId: string,
    amount: bigint,
    options?: VaultGroupJoinOptions,
  ): Promise<VaultGroupJoinResult> {
    return this.#submit("deposit", vaultId, amount, options);
  }

  /**
   * Request a withdrawal from one member of the group by joining every member's
   * current redeem batch with its own share token.
   *
   * @param vaultId - The member to withdraw from.
   * @param amount - The plaintext amount of shares; encrypted before submission.
   * @param options - Optional `operatorDeadline` and `strategy`.
   */
  async requestWithdrawal(
    vaultId: string,
    amount: bigint,
    options?: VaultGroupJoinOptions,
  ): Promise<VaultGroupJoinResult> {
    return this.#submit("redeem", vaultId, amount, options);
  }

  // INTERNAL

  async #submit(
    direction: BatcherDirection,
    vaultId: string,
    amount: bigint,
    options: VaultGroupJoinOptions | undefined,
  ): Promise<VaultGroupJoinResult> {
    this.member(vaultId);
    const account = await requireAlignedWalletAccount(
      direction === "deposit" ? "deposit" : "requestWithdrawal",
      this.sdk.signer,
      this.sdk.provider,
    );
    const holder = getAddress(account.address);

    // Built before the strategy is chosen, so packaging cannot reshape it.
    const batchers = await this.activeBatchers(direction);
    const legs = this.#legs(direction, vaultId, amount, batchers);

    const viaRouter = this.#useRouter(options?.strategy);
    const transactions = viaRouter
      ? [await this.#submitViaRouter(direction, holder, legs, options)]
      : await this.#submitDirectly(direction, holder, legs);

    return { vaultId, transactions, joins: this.#collectJoins(legs, transactions) };
  }

  #legs(
    direction: BatcherDirection,
    vaultId: string,
    amount: bigint,
    batchers: Readonly<Record<string, Address>>,
  ): readonly GroupLeg[] {
    return this.vaults.map((member) => {
      const batcher = batchers[member.id];
      if (batcher === undefined) {
        throw new ConfigurationError(
          `No active ${direction} batcher resolved for vault "${member.id}"`,
        );
      }
      return {
        vaultId: member.id,
        batcher,
        token: direction === "deposit" ? this.asset : member.share,
        amount: member.id === vaultId ? amount : 0n,
      };
    });
  }

  #useRouter(strategy: VaultGroupStrategy | undefined): boolean {
    if (strategy === "direct") {
      return false;
    }
    if (strategy === "router") {
      if (!this.router) {
        throw new ConfigurationError(`Vault group "${this.id}" has no router`);
      }
      return true;
    }
    return this.vaults.length > 1;
  }

  #requireRouter(): VaultRouter {
    if (!this.router) {
      throw new ConfigurationError(`Vault group "${this.id}" has no router`);
    }
    return this.router;
  }

  async #submitViaRouter(
    direction: BatcherDirection,
    holder: Address,
    legs: readonly GroupLeg[],
    options: VaultGroupJoinOptions | undefined,
  ): Promise<TransactionResult> {
    const router = this.#requireRouter();
    if (direction === "redeem") {
      // Each leg spends its own share token, so the router has to pull them.
      return router.join(legs, { operatorDeadline: options?.operatorDeadline });
    }

    // One transfer funds every leg, but the router rejects an unlisted wrapper
    // on chain, which costs the caller a reverted transaction.
    await router.requireTokenListed(this.asset);

    // Summed from the legs, not taken from the caller's amount: the transfer
    // and the allocation must agree or the router sweeps the difference back.
    const total = legs.reduce((sum, leg) => sum + leg.amount, 0n);
    const [transfer, allocation] = await Promise.all([
      this.sdk.encrypt({
        values: [{ value: total, type: "euint64" }],
        contractAddress: this.asset,
        userAddress: holder,
      }),
      router.encryptAllocation(legs),
    ]);
    const encryptedTotal = transfer.encryptedValues[0];
    if (!encryptedTotal) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    return this.#submitTransaction(
      "deposit",
      confidentialTransferAndCallContract(
        this.asset,
        router.address,
        encryptedTotal,
        transfer.inputProof,
        encodeAllocationData(allocation),
      ),
    );
  }

  /** One transfer per leg, which a wallet without atomic batching prompts for N times. */
  async #submitDirectly(
    direction: BatcherDirection,
    holder: Address,
    legs: readonly GroupLeg[],
  ): Promise<readonly TransactionResult[]> {
    const transactions: TransactionResult[] = [];
    if (direction === "deposit") {
      // One encrypt covers every transfer: they all spend the shared asset, so
      // one proof verifies against the single contract that checks it.
      const { encryptedValues, inputProof } = await this.sdk.encrypt({
        values: legs.map((leg) => ({ value: leg.amount, type: "euint64" as const })),
        contractAddress: this.asset,
        userAddress: holder,
      });
      if (encryptedValues.length !== legs.length) {
        throw new EncryptionFailedError(
          `Encryption returned ${encryptedValues.length} handles for ${legs.length} legs`,
        );
      }
      for (const [index, leg] of legs.entries()) {
        transactions.push(
          await this.#submitTransaction(
            "deposit",
            confidentialTransferAndCallContract(
              this.asset,
              leg.batcher,
              encryptedValues[index] as Hex,
              inputProof,
              "0x",
            ),
          ),
        );
      }
      return transactions;
    }

    // A redemption spends a different share token per leg, and each token
    // verifies only proofs bound to itself, so the legs cannot share one.
    for (const leg of legs) {
      const { encryptedValues, inputProof } = await this.sdk.encrypt({
        values: [{ value: leg.amount, type: "euint64" }],
        contractAddress: leg.token,
        userAddress: holder,
      });
      const encryptedAmount = encryptedValues[0];
      if (!encryptedAmount) {
        throw new EncryptionFailedError("Encryption returned no encrypted values");
      }
      transactions.push(
        await this.#submitTransaction(
          "requestWithdrawal",
          confidentialTransferAndCallContract(
            leg.token,
            leg.batcher,
            encryptedAmount,
            inputProof,
            "0x",
          ),
        ),
      );
    }
    return transactions;
  }

  #collectJoins(
    legs: readonly GroupLeg[],
    transactions: readonly TransactionResult[],
  ): readonly VaultGroupJoin[] {
    return legs.map((leg) => {
      for (const { receipt } of transactions) {
        const joined = findJoined(receipt.logs, leg.batcher);
        if (joined) {
          return {
            vaultId: leg.vaultId,
            batcher: leg.batcher,
            batchId: joined.batchId,
            confidentialJoinedAmount: joined.confidentialAmount,
          };
        }
      }
      throw new TransactionRevertedError(
        `No Joined event from batcher ${leg.batcher} for vault "${leg.vaultId}"`,
      );
    });
  }

  async #submitTransaction(
    operation: string,
    config: WriteContractConfig,
  ): Promise<TransactionResult> {
    const signer = this.sdk.signer;
    if (!signer) {
      throw new ConfigurationError(`Vault group "${this.id}" has no signer for ${operation}`);
    }
    try {
      const txHash: Hex = await signer.writeContract(config);
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(`VaultGroup transaction failed during ${operation}`, {
        cause: error,
      });
    }
  }
}

/** Create a {@link VaultGroup} bound to `sdk`. */
export function createVaultGroup(sdk: ZamaSDK, config: VaultGroupConfig): VaultGroup {
  return new VaultGroup(sdk, config);
}
