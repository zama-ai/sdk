import { getAddress, type Address } from "viem";
import { confidentialTransferAndCallContract } from "../contracts";
import {
  ConfigurationError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  UnlistedConfidentialTokenError,
  VaultBatcherPausedError,
} from "../errors";
import type { TransactionOperation } from "../events/sdk-events";
import type { EncryptedValue } from "../relayer/types";
import { Token } from "../token";
import type { TransactionResult, WriteContractConfig } from "../types";
import type { RawLog } from "../types/transaction";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { submitTransaction as submitSdkTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import { encodeAllocationData, MAX_GROUP_VAULTS, type AllocationLeg } from "./allocation";
import { joinContract, routerJoinContract } from "./contracts";
import { findJoined } from "./events";
import type { JoinOptions } from "./types";
import { VaultBatcher } from "./vault-batcher";
import { encryptAllocation, isTokenListed, readTokenWrapperRegistry } from "./vault-router";

type BatcherDirection = "deposit" | "redeem";

/** A vault in a group, with the batcher a leg to it joins in each direction. */
export interface VaultMemberConfig {
  /** What callers pass to `deposit` and `redeem` to pick this vault. */
  readonly id: string;
  /** The ERC-4626 vault contract, as both batchers report it. */
  readonly vault: Address;
  /** The confidential wrapper of this vault's shares, which its redeem batcher pulls. */
  readonly cShare: Address;
  /** The batcher a leg to this vault joins, per direction. */
  readonly batchers: { readonly deposit: Address; readonly redeem: Address };
}

/** What {@link createVaultGroup} takes: the shared asset, the members in leg order, and the router that reaches them. */
export interface VaultGroupConfig {
  /** Names the group in error messages. */
  readonly id: string;
  /** The confidential wrapper of the asset every member takes deposits in. */
  readonly cAsset: Address;
  /** The members, in the order their legs are submitted. */
  readonly vaults: readonly VaultMemberConfig[];
  /**
   * The fan-out router. Required for a group of more than one vault, and
   * unused by a group of one, which joins its batcher directly.
   */
  readonly router?: Address;
}

/** Options for {@link VaultGroup.deposit} and {@link VaultGroup.redeem}. */
export interface VaultGroupJoinOptions extends JoinOptions {
  /**
   * Unix timestamp until which an operator grant made for this submission is
   * valid. Only used where no grant is active. Defaults to now + 1 hour.
   */
  operatorUntil?: number;
}

/** What one leg's batcher reported. */
export interface VaultGroupJoin {
  /** The member this leg joined, by id. */
  vaultId: string;
  /** The batcher this leg joined, where its claim and quit happen. */
  batcher: Address;
  /** The batch the leg landed in; what that batcher's `claim` and `quit` take. */
  batchId: bigint;
  /**
   * The encrypted amount credited. Zero for every leg but the chosen one, and
   * zero for that one too if `skipBalanceCheck` let a short balance through,
   * since an ERC-7984 transfer moves nothing rather than reverting.
   */
  confidentialJoinedAmount: EncryptedValue;
}

/** The transaction that joined every member, plus what each member's batcher reported. */
export interface VaultGroupJoinResult extends TransactionResult {
  /** The member the caller chose; every other leg is a decoy. */
  vaultId: string;
  /** One entry per leg, in group order, decoys included. */
  joins: readonly VaultGroupJoin[];
}

interface GroupLeg extends AllocationLeg {
  readonly vaultId: string;
}

function duplicate<T>(values: readonly T[]): T | undefined {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
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
  /** The SDK the group reads and writes through. */
  readonly sdk: ZamaSDK;
  /** The configured group id, used in error messages. */
  readonly id: string;
  /** The shared asset wrapper, checksummed. */
  readonly cAsset: Address;
  /** The members in leg order, every address checksummed. */
  readonly vaults: readonly VaultMemberConfig[];
  // Unset for a group of one, which joins its batcher directly even if a router is configured.
  readonly #router: Address | undefined;
  // One instance per token, so repeated submissions reuse its decrypted-balance cache.
  readonly #tokens = new Map<Address, Token>();
  // One instance per batcher, so the reads that check the config are made once.
  readonly #batchers = new Map<Address, VaultBatcher>();
  // The promise is cached, not just the value, so concurrent readers share one lookup.
  #registry: Promise<Address> | null = null;

  constructor(sdk: ZamaSDK, config: VaultGroupConfig) {
    if (config.vaults.length === 0) {
      throw new ConfigurationError(`Vault group "${config.id}" names no vaults`);
    }
    if (config.vaults.length > MAX_GROUP_VAULTS) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vaults, above the ${MAX_GROUP_VAULTS} a submission can carry`,
      );
    }
    const vaults = config.vaults.map((member) => ({
      id: member.id,
      vault: getAddress(member.vault),
      cShare: getAddress(member.cShare),
      batchers: {
        deposit: getAddress(member.batchers.deposit),
        redeem: getAddress(member.batchers.redeem),
      },
    }));
    const duplicateId = duplicate(vaults.map((member) => member.id));
    if (duplicateId !== undefined) {
      throw new ConfigurationError(`Vault group "${config.id}" names "${duplicateId}" twice`);
    }
    const duplicateVault = duplicate(vaults.map((member) => member.vault));
    if (duplicateVault !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateVault} as the vault of more than one member`,
      );
    }
    const duplicateShare = duplicate(vaults.map((member) => member.cShare));
    if (duplicateShare !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateShare} as the cShare of more than one vault`,
      );
    }
    // A batcher serves one vault in one direction, so the same address anywhere twice is a mistake.
    const duplicateBatcher = duplicate(
      vaults.flatMap((member) => [member.batchers.deposit, member.batchers.redeem]),
    );
    if (duplicateBatcher !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names batcher ${duplicateBatcher} more than once`,
      );
    }
    if (vaults.length > 1 && config.router === undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${vaults.length} vaults but no router to reach them in one transaction`,
      );
    }

    this.sdk = sdk;
    this.id = config.id;
    this.cAsset = getAddress(config.cAsset);
    this.vaults = vaults;
    this.#router = vaults.length > 1 && config.router ? getAddress(config.router) : undefined;
  }

  /**
   * Whether the router's registry lists `cAsset`, which a deposit through the
   * router requires; always `true` for a group of one vault, which uses no
   * router. Governance can revoke a listing, so the answer is not cached.
   */
  async isAssetListed(): Promise<boolean> {
    if (!this.#router) {
      return true;
    }
    return isTokenListed(this.sdk, await this.#tokenWrapperRegistry(), this.cAsset);
  }

  /**
   * One member by id.
   *
   * @throws if no member has id `vaultId`. {@link ConfigurationError}
   */
  member(vaultId: string): VaultMemberConfig {
    const member = this.vaults.find((candidate) => candidate.id === vaultId);
    if (!member) {
      throw new ConfigurationError(`Vault group "${this.id}" has no vault "${vaultId}"`);
    }
    return member;
  }

  /**
   * Deposit the confidential asset into one member of the group, joining every
   * member's current deposit batch in one transaction.
   *
   * @param vaultId - The member to deposit into.
   * @param amount - The plaintext amount; encrypted before submission.
   *
   * @remarks
   * There is no `beneficiary`: the router credits the account the legs came
   * from, so a group deposit cannot be made on someone else's behalf.
   *
   * @throws if no member has id `vaultId`, or a member's batcher pulls a token other than `cAsset` or reports a vault other than the member's. {@link ConfigurationError}
   * @throws if a member's batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the router's registry does not list `cAsset`. {@link UnlistedConfidentialTokenError}
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
   * current redeem batch in one transaction, each leg with its own share token.
   *
   * @param vaultId - The member to redeem from.
   * @param amount - The plaintext amount of shares: ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   *
   * @remarks
   * The router pulls every leg's share token, so before the join this grants
   * it an operator approval on each member's `cShare` that lacks one. Each
   * grant is its own wallet prompt, so a first redemption from a group of N
   * vaults can ask the user to sign up to N + 1 times.
   *
   * @throws if no member has id `vaultId`, or a member's batcher pulls a token other than its `cShare` or reports a vault other than the member's. {@link ConfigurationError}
   * @throws if a member's batcher is paused. {@link VaultBatcherPausedError}
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

    const legs = this.#legs(direction, vaultId, amount);
    await this.#verifyLegs(legs);

    const transaction = this.#router
      ? direction === "deposit"
        ? await this.#pushThroughRouter(this.#router, holder, legs)
        : await this.#pullThroughRouter(this.#router, holder, legs, options?.operatorUntil)
      : await this.#joinDirectly(holder, legs, options?.operatorUntil);

    return {
      ...transaction,
      vaultId,
      joins: this.#collectJoins(holder, legs, transaction.receipt.logs),
    };
  }

  #legs(direction: BatcherDirection, vaultId: string, amount: bigint): readonly GroupLeg[] {
    return this.vaults.map((member) => {
      return {
        vaultId: member.id,
        batcher: member.batchers[direction],
        token: direction === "deposit" ? this.cAsset : member.cShare,
        amount: member.id === vaultId ? amount : 0n,
      };
    });
  }

  #batcher(address: Address): VaultBatcher {
    let batcher = this.#batchers.get(address);
    if (!batcher) {
      batcher = new VaultBatcher(this.sdk, address);
      this.#batchers.set(address, batcher);
    }
    return batcher;
  }

  /**
   * A wrong `cShare` would pull the wrong token, a wrong `vault` mislabel a
   * position, and one paused batcher reverts the whole submission.
   */
  async #verifyLegs(legs: readonly GroupLeg[]): Promise<void> {
    await Promise.all(
      legs.map(async (leg) => {
        const batcher = this.#batcher(leg.batcher);
        const [fromToken, vault, paused] = await Promise.all([
          batcher.fromToken(),
          batcher.vault(),
          batcher.paused(),
        ]);
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
        if (paused) {
          throw new VaultBatcherPausedError(
            `Batcher ${leg.batcher} of vault "${leg.vaultId}" in group "${this.id}" is paused, so no member can be joined until it resumes`,
            { batcher: leg.batcher, vaultId: leg.vaultId },
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

  async #tokenWrapperRegistry(): Promise<Address> {
    if (!this.#router) {
      throw new ConfigurationError(`Vault group "${this.id}" has no router`);
    }
    this.#registry ??= readTokenWrapperRegistry(this.sdk, this.#router).catch((error: unknown) => {
      this.#registry = null;
      throw error;
    });
    return this.#registry;
  }

  /**
   * Fail before submitting anything if the router would reject a push of
   * `cAsset`, which it does with a revert that costs the caller a transaction.
   */
  async #requireAssetListed(): Promise<void> {
    if (await this.isAssetListed()) {
      return;
    }
    throw new UnlistedConfidentialTokenError(
      `The vault router's registry does not list ${this.cAsset}, so it would reject a transfer of it`,
      { token: this.cAsset, registry: await this.#tokenWrapperRegistry() },
    );
  }

  /**
   * Whoever pulls a leg's token does so with `confidentialTransferFrom`, which
   * ERC-7984 rejects unless the puller is already an operator of the holder.
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

  /** A deposit pushes the asset to the router, which funds every leg out of the one transfer. */
  async #pushThroughRouter(
    router: Address,
    holder: Address,
    legs: readonly GroupLeg[],
  ): Promise<TransactionResult> {
    await this.#requireAssetListed();

    // Summed from the legs, not the caller's amount: the router sweeps back any difference.
    const total = legs.reduce((sum, leg) => sum + leg.amount, 0n);
    const [transfer, allocation] = await Promise.all([
      this.sdk.encrypt({
        values: [{ value: total, type: "euint64" }],
        contractAddress: this.cAsset,
        userAddress: holder,
      }),
      encryptAllocation(this.sdk, router, holder, legs),
    ]);
    const encryptedTotal = transfer.encryptedValues[0];
    if (!encryptedTotal) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    return this.#submitTransaction(
      "vault:routerJoin",
      router,
      confidentialTransferAndCallContract(
        this.cAsset,
        router,
        encryptedTotal,
        transfer.inputProof,
        encodeAllocationData(allocation),
      ),
    );
  }

  /** A redemption has the router pull each leg's share token, so it needs a grant on each. */
  async #pullThroughRouter(
    router: Address,
    holder: Address,
    legs: readonly GroupLeg[],
    operatorUntil: number | undefined,
  ): Promise<TransactionResult> {
    for (const token of new Set(legs.map((leg) => leg.token))) {
      await this.#ensureOperator(holder, token, router, operatorUntil);
    }
    const allocation = await encryptAllocation(this.sdk, router, holder, legs);
    return this.#submitTransaction(
      "vault:routerJoin",
      router,
      routerJoinContract(router, allocation.legs, allocation.inputProof),
    );
  }

  /**
   * A group of one joins its batcher directly, encrypting against it: a
   * batcher only pulls (it is not an ERC-7984 receiver) and verifies only
   * proofs bound to itself.
   */
  async #joinDirectly(
    holder: Address,
    legs: readonly GroupLeg[],
    operatorUntil: number | undefined,
  ): Promise<TransactionResult> {
    const [leg] = legs;
    if (!leg || legs.length !== 1) {
      throw new ConfigurationError(
        `Vault group "${this.id}" has ${legs.length} legs but no router to carry them`,
      );
    }
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
    return this.#submitTransaction(
      "vault:join",
      leg.batcher,
      joinContract(leg.batcher, holder, encryptedAmount, inputProof),
    );
  }

  #collectJoins(
    holder: Address,
    legs: readonly GroupLeg[],
    logs: readonly RawLog[],
  ): readonly VaultGroupJoin[] {
    return legs.map((leg) => {
      const joined = findJoined(logs, leg.batcher, holder);
      if (!joined) {
        throw new TransactionRevertedError(
          `No Joined event for ${holder} from batcher ${leg.batcher} for vault "${leg.vaultId}"`,
        );
      }
      return {
        vaultId: leg.vaultId,
        batcher: leg.batcher,
        batchId: joined.batchId,
        confidentialJoinedAmount: joined.confidentialAmount,
      };
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

/** Create a {@link VaultGroup}; the same as `new VaultGroup(sdk, config)`. */
export function createVaultGroup(sdk: ZamaSDK, config: VaultGroupConfig): VaultGroup {
  return new VaultGroup(sdk, config);
}
