import { getAddress, type Address } from "viem";
import { confidentialTransferAndCallContract } from "../contracts";
import {
  ConfigurationError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  TransactionRevertedError,
} from "../errors";
import type { TransactionOperation } from "../events/sdk-events";
import type { EncryptedValue } from "../relayer/types";
import { Token } from "../token";
import type { TransactionResult, WriteContractConfig } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { submitTransaction as submitSdkTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import { encodeAllocationData, MAX_GROUP_VAULTS, type AllocationLeg } from "./allocation";
import {
  normalizeBatcherHistory,
  resolveActiveBatcher,
  type BatcherDirection,
  type BatcherHistory,
} from "./batcher-history";
import { joinContract } from "./contracts";
import { findJoined } from "./events";
import type { JoinOptions } from "./types";
import { VaultBatcher } from "./vault-batcher";
import { VaultRouter } from "./vault-router";

/** One vault of a group. */
export interface VaultMemberConfig {
  /** Stable identifier the caller uses to pick this vault. */
  readonly id: string;
  /** The ERC-4626 vault contract, as both batchers report it. */
  readonly vault: Address;
  /** The confidential wrapper of this vault's shares, which its redeem batcher pulls. */
  readonly cShare: Address;
  /** This vault's batcher history, one entry per direction. */
  readonly batchers: Readonly<Record<BatcherDirection, BatcherHistory>>;
}

/** A set of vaults that share one confidential asset and are joined together. */
export interface VaultGroupConfig {
  /** Stable identifier for the group. */
  readonly id: string;
  /** The confidential wrapper of the asset every member takes deposits in. */
  readonly cAsset: Address;
  /** The members, in the order their legs are submitted. */
  readonly vaults: readonly VaultMemberConfig[];
  /** The fan-out router. Required for a group of more than one vault. */
  readonly router?: Address;
}

/** How a group submission is packaged. */
export type VaultGroupStrategy = "auto" | "router" | "direct";

/** Options for {@link VaultGroup.deposit} and {@link VaultGroup.redeem}. */
export interface VaultGroupJoinOptions extends JoinOptions {
  /**
   * Unix timestamp until which an operator grant made for this submission is
   * valid — the router's on each share token, or each batcher's on its leg's
   * token. Only used where none is active. Defaults to `Token.setOperator`'s
   * own default (now + 1 hour).
   */
  operatorUntil?: number;
  /**
   * `"auto"` (the default) uses the router for a group of more than one vault
   * and joins the batcher directly for a group of one. `"direct"` submits one
   * batcher `join` per leg instead, as separate transactions in group order;
   * the legs are identical either way. A failure after the first leg leaves
   * the earlier joins committed on their batchers, to be quit from there.
   */
  strategy?: VaultGroupStrategy;
}

/** What one leg's batcher reported. */
export interface VaultGroupJoin {
  /** The member this leg belongs to. */
  vaultId: string;
  /** The batcher it reached, as resolved at submission time. */
  batcher: Address;
  /** The batch the join landed in. */
  batchId: bigint;
  /**
   * The encrypted amount credited. Zero for every leg but the chosen one — and
   * zero for that one too if `skipBalanceCheck` let a short balance through,
   * since an ERC-7984 transfer moves nothing rather than reverting.
   */
  confidentialJoinedAmount: EncryptedValue;
}

/** The outcome of one group deposit or redemption. */
export interface VaultGroupJoinResult {
  /** The member the caller chose. */
  vaultId: string;
  /** One transaction on the router path, one per leg on the direct path. */
  transactions: readonly TransactionResult[];
  /** One entry per leg, in group order. */
  joins: readonly VaultGroupJoin[];
}

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
 * one: a deposit into one member joins *every* member's batch, the chosen
 * vault with the amount and the rest with an encrypted zero, so callers get a
 * batch position on every member.
 */
export class VaultGroup {
  /** The SDK instance this group reads and writes through. */
  readonly sdk: ZamaSDK;
  /** Stable identifier for the group. */
  readonly id: string;
  /** The confidential wrapper of the asset every member takes deposits in. */
  readonly cAsset: Address;
  /** The members, in leg order. */
  readonly vaults: readonly VaultMemberConfig[];
  /** The fan-out router, absent for a single-vault group. */
  readonly router: VaultRouter | undefined;

  // One instance per token, so repeated submissions reuse its decrypted-balance cache.
  readonly #tokens = new Map<Address, Token>();
  // One instance per batcher, so the reads that check the config are made once.
  readonly #batchers = new Map<Address, VaultBatcher>();

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
    const duplicateShare = duplicate(config.vaults.map((member) => member.cShare));
    if (duplicateShare !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateShare} as the cShare of more than one vault`,
      );
    }
    if (config.vaults.length > 1 && config.router === undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vaults but no router to reach them in one transaction`,
      );
    }

    this.sdk = sdk;
    this.id = config.id;
    this.cAsset = getAddress(config.cAsset);
    this.vaults = config.vaults.map((member) => ({
      id: member.id,
      vault: getAddress(member.vault),
      cShare: getAddress(member.cShare),
      batchers: {
        deposit: normalizeBatcherHistory(member.batchers.deposit),
        redeem: normalizeBatcherHistory(member.batchers.redeem),
      },
    }));
    this.router = config.router ? new VaultRouter(sdk, config.router) : undefined;
  }

  /**
   * One member by its id.
   *
   * @throws if no member has that id. {@link ConfigurationError}
   */
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
   *
   * @remarks
   * There is no `beneficiary`: the router credits the account the legs came
   * from, so a group deposit cannot be made on someone else's behalf.
   *
   * @throws if a member's `cAsset` or `vault` disagrees with its batcher. {@link ConfigurationError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   */
  async deposit(
    vaultId: string,
    amount: bigint,
    options?: VaultGroupJoinOptions,
  ): Promise<VaultGroupJoinResult> {
    return this.#submit("deposit", vaultId, amount, options);
  }

  /**
   * Redeem shares of one member of the group by joining every member's
   * current redeem batch, each leg with its own share token.
   *
   * @param vaultId - The member to redeem from.
   * @param amount - The plaintext amount of shares — ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   *
   * @throws if a member's `cShare` or `vault` disagrees with its batcher. {@link ConfigurationError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   */
  async redeem(
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
    const member = this.member(vaultId);
    const account = await requireAlignedWalletAccount(
      direction,
      this.sdk.signer,
      this.sdk.provider,
    );
    const holder = getAddress(account.address);

    // A short balance joins every batch with nothing and still costs the transaction.
    if (!options?.skipBalanceCheck) {
      await this.#assertBalance(
        direction,
        direction === "deposit" ? this.cAsset : member.cShare,
        amount,
      );
    }

    // Built before the strategy is chosen: legs that varied by strategy would leak the wallet class.
    const batchers = await this.activeBatchers(direction);
    const legs = this.#legs(direction, vaultId, amount, batchers);
    await this.#verifyLegs(legs);

    const viaRouter = this.#useRouter(options?.strategy);
    const transactions = viaRouter
      ? [await this.#submitViaRouter(direction, holder, legs, options)]
      : await this.#submitDirectly(holder, legs, options?.operatorUntil);

    return { vaultId, transactions, joins: this.#collectJoins(holder, legs, transactions) };
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
        token: direction === "deposit" ? this.cAsset : member.cShare,
        amount: member.id === vaultId ? amount : 0n,
      };
    });
  }

  #useRouter(strategy: VaultGroupStrategy | undefined): boolean {
    if (strategy === "direct") {
      return false;
    }
    if (strategy === "router") {
      this.#requireRouter();
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

  #batcher(address: Address): VaultBatcher {
    let batcher = this.#batchers.get(address);
    if (!batcher) {
      batcher = new VaultBatcher(this.sdk, address);
      this.#batchers.set(address, batcher);
    }
    return batcher;
  }

  /** A wrong `cShare` would pull the wrong token and a wrong `vault` mislabel a position. */
  async #verifyLegs(legs: readonly GroupLeg[]): Promise<void> {
    await Promise.all(
      legs.map(async (leg) => {
        const batcher = this.#batcher(leg.batcher);
        const [fromToken, vault] = await Promise.all([batcher.fromToken(), batcher.vault()]);
        if (getAddress(fromToken) !== leg.token) {
          throw new ConfigurationError(
            `Batcher ${leg.batcher} pulls ${getAddress(fromToken)}, but vault "${leg.vaultId}" of group "${this.id}" is configured with ${leg.token}`,
          );
        }
        const configured = this.member(leg.vaultId).vault;
        if (getAddress(vault) !== configured) {
          throw new ConfigurationError(
            `Batcher ${leg.batcher} reports vault ${getAddress(vault)}, but vault "${leg.vaultId}" of group "${this.id}" is configured as ${configured}`,
          );
        }
      }),
    );
  }

  #token(address: Address): Token {
    let token = this.#tokens.get(address);
    if (!token) {
      token = new Token(this.sdk, address);
      this.#tokens.set(address, token);
    }
    return token;
  }

  async #assertBalance(operation: string, token: Address, amount: bigint): Promise<void> {
    const instance = this.#token(token);
    return assertConfidentialBalance({
      operation,
      tokenAddress: token,
      amount,
      signer: this.sdk.signer,
      provider: this.sdk.provider,
      readBalance: (owner) => instance.balanceOf(owner),
    });
  }

  /**
   * A batcher pulls with `confidentialTransferFrom`, which ERC-7984 rejects
   * unless the batcher is already an operator of the caller.
   */
  async #ensureOperator(
    holder: Address,
    token: Address,
    operator: Address,
    until: number | undefined,
  ): Promise<void> {
    const instance = this.#token(token);
    if (!(await instance.isOperator(holder, operator))) {
      await instance.setOperator(operator, until);
    }
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
      return router.join(legs, { operatorUntil: options?.operatorUntil });
    }

    await router.requireTokenListed(this.cAsset);

    // Summed from the legs, not the caller's amount: the router sweeps back any difference.
    const total = legs.reduce((sum, leg) => sum + leg.amount, 0n);
    const [transfer, allocation] = await Promise.all([
      this.sdk.encrypt({
        values: [{ value: total, type: "euint64" }],
        contractAddress: this.cAsset,
        userAddress: holder,
      }),
      router.encryptAllocation(legs),
    ]);
    const encryptedTotal = transfer.encryptedValues[0];
    if (!encryptedTotal) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    return this.#submitTransaction(
      "transferAndCall",
      this.cAsset,
      confidentialTransferAndCallContract(
        this.cAsset,
        router.address,
        encryptedTotal,
        transfer.inputProof,
        encodeAllocationData(allocation),
      ),
    );
  }

  /**
   * One `join` per leg, each encrypted against its own batcher: a batcher only
   * pulls (it is not an ERC-7984 receiver) and verifies only proofs bound to itself.
   */
  async #submitDirectly(
    holder: Address,
    legs: readonly GroupLeg[],
    operatorUntil: number | undefined,
  ): Promise<readonly TransactionResult[]> {
    const transactions: TransactionResult[] = [];
    for (const leg of legs) {
      await this.#ensureOperator(holder, leg.token, leg.batcher, operatorUntil);
      const { encryptedValues, inputProof } = await this.sdk.encrypt({
        values: [{ value: leg.amount, type: "euint64" }],
        contractAddress: leg.batcher,
        userAddress: holder,
      });
      const encryptedAmount = encryptedValues[0];
      if (!encryptedAmount) {
        throw new EncryptionFailedError("Encryption returned no encrypted values");
      }
      transactions.push(
        await this.#submitTransaction(
          "vault:join",
          leg.batcher,
          joinContract(leg.batcher, holder, encryptedAmount, inputProof),
        ),
      );
    }
    return transactions;
  }

  #collectJoins(
    holder: Address,
    legs: readonly GroupLeg[],
    transactions: readonly TransactionResult[],
  ): readonly VaultGroupJoin[] {
    return legs.map((leg) => {
      for (const { receipt } of transactions) {
        const joined = findJoined(receipt.logs, leg.batcher, holder);
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
        `No Joined event for ${holder} from batcher ${leg.batcher} for vault "${leg.vaultId}"`,
      );
    });
  }

  async #submitTransaction(
    operation: TransactionOperation,
    contractAddress: Address,
    config: WriteContractConfig,
  ): Promise<TransactionResult> {
    const signer = this.sdk.signer;
    if (!signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return submitSdkTransaction({
      operation,
      signer,
      provider: this.sdk.provider,
      config,
      emit: (input) => this.sdk.emitEvent(input, contractAddress),
      logger: this.sdk.logger,
    });
  }
}

/** Create a {@link VaultGroup} bound to `sdk`. */
export function createVaultGroup(sdk: ZamaSDK, config: VaultGroupConfig): VaultGroup {
  return new VaultGroup(sdk, config);
}
