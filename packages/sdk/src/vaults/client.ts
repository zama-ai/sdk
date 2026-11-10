import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import {
  confidentialTransferAndCallContract,
  isConfidentialTokenValidContract,
  isOperatorContract,
  setOperatorContract,
  unwrapAmountContract,
} from "../contracts";
import {
  BalanceCheckUnavailableError,
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  UnlistedConfidentialTokenError,
  VaultActionNotAllowedError,
  VaultBatcherPausedError,
  VaultJoinUnconfirmedError,
} from "../errors";
import type { TransactionOperation } from "../events/sdk-events";
import type { EncryptedValue } from "../relayer/types";
import type { TelemetryOperation } from "../telemetry";
import { Token } from "../token";
import type {
  ContractAbi,
  GenericSigner,
  ReadContractArgs,
  ReadContractConfig,
  ReadFunctionName,
  TransactionResult,
  WriteContractConfig,
} from "../types";
import { requireAlignedWalletAccount, requireWriteChain } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import { isEncryptedValueZero } from "../utils/handles";
import { submitTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import {
  batcherAddresses,
  toBatcherHistory,
  type BatcherHistory,
  type GroupId,
  type VaultId,
  type VaultsConfig,
} from "./config";
import {
  batchCallbackDeadlineContract,
  batchCreatedAtContract,
  batchDispatchedAtContract,
  batchMinBatchAgeContract,
  batchStateContract,
  claimContract,
  currentBatchIdContract,
  depositsContract,
  dispatchBatchCallbackContract,
  dispatchBatchContract,
  encodeAllocationData,
  exchangeRateContract,
  exchangeRateDecimalsContract,
  fromTokenContract,
  joinContract,
  pausedContract,
  quitContract,
  recoverContract,
  routerJoinContract,
  toTokenContract,
  tokenWrapperRegistryContract,
  unwrapRequestIdContract,
  vaultContract,
} from "./contracts";
import { takeJoinedBatchId } from "./joined";
import { toPosition } from "./position";
import type {
  ActionOutcome,
  BatchState,
  Direction,
  JoinLeg,
  JoinOptions,
  JoinOutcome,
  JoinRecord,
  Leg,
  OpenBatch,
  Position,
  PrepareJoinOptions,
  PreparedVaultAction,
  VaultCall,
} from "./types";

const DEFAULT_GRANT_VALIDITY_SECONDS = 3600;

// The contract's uint8 enum, by index.
const BATCH_STATES: readonly BatchState[] = ["pending", "dispatched", "finalized", "canceled"];

const ENCRYPT_OPERATION = {
  deposit: "vault-deposit",
  redeem: "vault-redeem",
} as const satisfies Record<Direction, TelemetryOperation>;

type Vaults<
  TConfig extends VaultsConfig,
  TGroupId extends GroupId<TConfig>,
> = TConfig["groups"][TGroupId]["vaults"];

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;
type IsSingle<TKey> = string extends TKey
  ? boolean
  : [TKey] extends [UnionToIntersection<TKey>]
    ? true
    : false;

/**
 * What `deposit` and `redeem` take for one group. A group of one may leave
 * out `vaultId` and may name a `beneficiary`; a larger group needs `vaultId`
 * and cannot take a `beneficiary`, because the router credits the sender.
 */
export type VaultJoinParams<
  TConfig extends VaultsConfig,
  TGroupId extends GroupId<TConfig> = GroupId<TConfig>,
> = {
  [G in TGroupId]: IsSingle<keyof Vaults<TConfig, G>> extends true
    ? {
        readonly groupId: G;
        readonly vaultId?: VaultId<TConfig, G>;
        /** Plaintext; encrypted before it leaves the SDK. For a redeem, in shares. */
        readonly amount: bigint;
        /** The account the batcher credits, when not the sender. */
        readonly beneficiary?: Address;
      }
    : {
        readonly groupId: G;
        readonly vaultId: VaultId<TConfig, G>;
        /** Plaintext; encrypted before it leaves the SDK. For a redeem, in shares. */
        readonly amount: bigint;
        readonly beneficiary?: never;
      };
}[TGroupId];

/** A join record of a config. */
export type VaultRecord<TConfig extends VaultsConfig> = {
  [G in GroupId<TConfig>]: JoinRecord<G, VaultId<TConfig, G>>;
}[GroupId<TConfig>];

/** A position of a config. */
export type VaultPosition<TConfig extends VaultsConfig> = {
  [G in GroupId<TConfig>]: Position<G, VaultId<TConfig, G>>;
}[GroupId<TConfig>];

interface ResolvedVault {
  readonly id: string;
  readonly deposit: BatcherHistory;
  readonly redeem: BatcherHistory;
}

interface ResolvedGroup {
  readonly id: string;
  readonly asset: Address;
  readonly vaults: readonly ResolvedVault[];
}

/** A call as the SDK sends it: the ABI config, and what to report it as. */
interface PlannedCall {
  readonly config: WriteContractConfig;
  readonly operation: TransactionOperation;
}

interface Plan {
  readonly kind: PreparedVaultAction["kind"];
  readonly groupId: string;
  readonly sender: Address | null;
  readonly grants: readonly PlannedCall[];
  readonly calls: readonly PlannedCall[];
  readonly atomic: boolean;
  readonly expiresAt: bigint | null;
}

interface PlannedLeg {
  readonly vaultId: string;
  readonly batcher: Address;
  /** What the leg spends: the asset for a deposit, the vault's share token for a redeem. */
  readonly token: Address;
  readonly amount: bigint;
}

interface JoinPlan extends Plan {
  /** The account the batchers credit. */
  readonly beneficiary: Address;
  readonly direction: Direction;
  readonly legs: readonly { readonly vaultId: string; readonly batcher: Address }[];
}

function historyOf(vault: ResolvedVault, direction: Direction): BatcherHistory {
  return direction === "deposit" ? vault.deposit : vault.redeem;
}

function toCall({ config }: PlannedCall): VaultCall {
  return {
    to: config.address,
    data: encodeFunctionData({
      abi: config.abi,
      functionName: config.functionName,
      args: config.args,
    } as Parameters<typeof encodeFunctionData>[0]),
  };
}

// Arrays built in leg order line up with the legs, so a gap is an SDK bug, not a user error.
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  assertNonNullable(value, `vault leg ${index}`);
  return value;
}

function duplicate<T>(values: readonly T[]): T | undefined {
  return values.find((value, index) => values.indexOf(value) !== index);
}

// A failed memoized read is not cached, so the next call tries again.
function memoize<T>(cache: Map<string, Promise<T>>, key: string, read: () => Promise<T>) {
  let pending = cache.get(key);
  if (pending === undefined) {
    pending = read().catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Vaults described by {@link defineVaults}, bound to an SDK. Every action has
 * a `prepare*` method, which returns the calls as plain data for a host that
 * sends through its own pipeline, and a method of the same verb that sends
 * them with the SDK's signer.
 *
 * Every join sends a leg to every vault of its group, the chosen one with the
 * amount and the rest with an encrypted zero. Every exit covers every leg.
 * Neither can be narrowed: acting on part of a join would reveal the chosen
 * vault.
 */
export class VaultClient<const TConfig extends VaultsConfig = VaultsConfig> {
  /** The SDK the client reads, encrypts and sends through. */
  readonly sdk: ZamaSDK;
  /** The config it was created with. */
  readonly config: TConfig;
  /** The chain every batcher is on. */
  readonly chainId: number;

  readonly #groups: ReadonlyMap<string, ResolvedGroup>;
  readonly #reads = new Map<string, Promise<unknown>>();

  constructor(sdk: ZamaSDK, config: TConfig) {
    this.sdk = sdk;
    this.config = config;
    this.chainId = config.chainId;
    this.#groups = new Map(
      Object.entries(config.groups).map(([id, group]) => [
        id,
        {
          id,
          asset: getAddress(group.asset),
          vaults: Object.entries(group.vaults).map(([vaultId, vault]) => ({
            id: vaultId,
            deposit: toBatcherHistory(vault.depositBatcher),
            redeem: toBatcherHistory(vault.redeemBatcher),
          })),
        },
      ]),
    );
  }

  // PREPARE

  /**
   * Build a deposit of the group's asset without sending it: the checks, the
   * encryption, and the calls. Every vault of the group gets a leg.
   *
   * @throws if the group or vault is unknown, `beneficiary` is given in a group of more than one, or the config does not match the chain. {@link ConfigurationError}
   * @throws if any vault's deposit batcher is paused. {@link VaultBatcherPausedError}
   * @throws if a router deposit's asset is not listed in the router's registry. {@link UnlistedConfidentialTokenError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   */
  async prepareDeposit(
    params: VaultJoinParams<TConfig>,
    options?: PrepareJoinOptions,
  ): Promise<PreparedVaultAction<GroupId<TConfig>>> {
    return this.#prepared(await this.#planJoin("deposit", params, options));
  }

  /**
   * Build a redemption of a vault's shares without sending it. In a group of
   * more than one, sent sequentially, it goes through the router, which pulls
   * every leg's share token: `grants` holds the operator grants the account
   * still lacks.
   *
   * @throws as {@link prepareDeposit}, for the redeem batchers.
   */
  async prepareRedeem(
    params: VaultJoinParams<TConfig>,
    options?: PrepareJoinOptions,
  ): Promise<PreparedVaultAction<GroupId<TConfig>>> {
    return this.#prepared(await this.#planJoin("redeem", params, options));
  }

  /**
   * Build the exit of every leg: quit a pending leg, claim a finalized one,
   * recover a canceled one. A pending leg can only be quit by the account,
   * so `sender` is then the account; otherwise anyone may send it.
   *
   * @throws if a leg is dispatched. {@link VaultActionNotAllowedError}
   */
  async prepareExit(record: VaultRecord<TConfig>): Promise<PreparedVaultAction<GroupId<TConfig>>> {
    return this.#prepared(await this.#planExit(record));
  }

  /**
   * Build the dispatch of every leg's batch that is old enough, on an
   * unpaused batcher. Anyone may send it. A keeper normally does.
   *
   * @throws if no leg can be dispatched. {@link VaultActionNotAllowedError}
   */
  async prepareDispatch(
    record: VaultRecord<TConfig>,
  ): Promise<PreparedVaultAction<GroupId<TConfig>>> {
    return this.#prepared(await this.#planDispatch(record));
  }

  /**
   * Build the settlement of every dispatched leg's batch, with its publicly
   * decrypted amount. Anyone may send it. A keeper normally does. Past a
   * batch's callback deadline, the same call cancels it.
   *
   * @throws if no leg is dispatched. {@link VaultActionNotAllowedError}
   * @throws if the provider is not on the config's chain. {@link ConfigurationError}
   */
  async prepareFinalize(
    record: VaultRecord<TConfig>,
  ): Promise<PreparedVaultAction<GroupId<TConfig>>> {
    return this.#prepared(await this.#planFinalize(record));
  }

  // SEND

  /**
   * Deposit with the SDK's signer: prepare, send, and read the batch ids
   * back from the receipt.
   *
   * @throws as {@link prepareDeposit}.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if the wallet is not on the config's chain. {@link ChainMismatchError}
   * @throws if the receipt does not confirm every leg. {@link VaultJoinUnconfirmedError}
   */
  async deposit(
    params: VaultJoinParams<TConfig>,
    options?: JoinOptions,
  ): Promise<JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>> {
    return this.#join("deposit", params, options);
  }

  /**
   * Redeem with the SDK's signer. A first redemption from a group of N vaults
   * asks the wallet for up to N grants, then the join.
   *
   * @throws as {@link deposit}.
   */
  async redeem(
    params: VaultJoinParams<TConfig>,
    options?: JoinOptions,
  ): Promise<JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>> {
    return this.#join("redeem", params, options);
  }

  /** Exit every leg with the SDK's signer. Safe to repeat: an exited leg moves nothing. */
  async exit(record: VaultRecord<TConfig>): Promise<ActionOutcome> {
    return this.#send(await this.#planExit(record));
  }

  /** Dispatch every eligible leg's batch with the SDK's signer. */
  async dispatch(record: VaultRecord<TConfig>): Promise<ActionOutcome> {
    return this.#send(await this.#planDispatch(record));
  }

  /** Finalize every dispatched leg's batch with the SDK's signer. */
  async finalize(record: VaultRecord<TConfig>): Promise<ActionOutcome> {
    return this.#send(await this.#planFinalize(record));
  }

  // READ

  /**
   * Every leg's batch state, timings and deposit, in one round of reads, and
   * what can be sent now.
   *
   * @param options - `decrypt`: decrypt every leg's deposit together, as the
   *   signer, to fill `amount`, `chosenVaultId` and the `closed` phase.
   */
  async readPosition(
    record: VaultRecord<TConfig>,
    options?: { readonly decrypt?: boolean },
  ): Promise<VaultPosition<TConfig>> {
    const { legs, now } = await this.#readLegs(record, options?.decrypt ?? false);
    return toPosition(record, legs, now) as VaultPosition<TConfig>;
  }

  /** The open batch of every vault of a group, for a form that shows when the next batch closes. */
  async readOpenBatches<TGroupId extends GroupId<TConfig>>(
    groupId: TGroupId,
    direction: Direction,
  ): Promise<readonly OpenBatch<VaultId<TConfig, TGroupId>>[]> {
    const group = this.#group(groupId);
    return Promise.all(
      group.vaults.map(async (vault) => {
        const batcher = await this.#activeBatcher(vault, direction);
        const [batchId, paused] = await Promise.all([
          this.#read(currentBatchIdContract(batcher)),
          this.#read(pausedContract(batcher)),
        ]);
        const [createdAt, minAge] = await Promise.all([
          this.#read(batchCreatedAtContract(batcher, batchId)),
          this.#read(batchMinBatchAgeContract(batcher, batchId)),
        ]);
        return {
          vaultId: vault.id as VaultId<TConfig, TGroupId>,
          batcher,
          batchId,
          dispatchableAt: createdAt + minAge,
          paused,
        };
      }),
    );
  }

  // PLANS

  async #planJoin(
    direction: Direction,
    params: VaultJoinParams<TConfig>,
    options: PrepareJoinOptions | undefined,
  ): Promise<JoinPlan> {
    const group = this.#group(params.groupId);
    const chosen = this.#chosenVault(group, params.vaultId);
    const skip = new Set(options?.skipChecks);
    const account = await this.#account(direction, options?.account, skip.has("balance"));
    const beneficiary = params.beneficiary === undefined ? account : getAddress(params.beneficiary);
    if (beneficiary !== account && group.vaults.length > 1) {
      throw new ConfigurationError(
        `Group "${group.id}" has ${group.vaults.length} vaults, and only a group of one can credit a beneficiary`,
      );
    }
    const route =
      group.vaults.length === 1
        ? beneficiary === account
          ? "transfer"
          : "pull"
        : options?.walletMode === "atomic"
          ? "legs"
          : direction === "deposit"
            ? "router-push"
            : "router-pull";
    const router = route.startsWith("router") ? this.#router() : undefined;

    // Encryption runs on the provider's chain, so check it before anything prompts.
    await this.#requireProviderChain(`vault ${direction}`);
    const batchers = await Promise.all(
      group.vaults.map((vault) => this.#activeBatcher(vault, direction)),
    );
    const [tokens] = await Promise.all([
      this.#legTokens(group, direction),
      skip.has("config") ? undefined : this.#verifyGroup(group),
      this.#assertNotPaused(group, batchers),
      router !== undefined && route === "router-push" && !skip.has("config")
        ? this.#assertAssetListed(group, router)
        : undefined,
    ]);
    // Every vault gets a leg, the unchosen ones with zero: trimming them would reveal the choice.
    const legs: PlannedLeg[] = group.vaults.map((vault, index) => ({
      vaultId: vault.id,
      batcher: at(batchers, index),
      token: at(tokens, index),
      amount: vault === chosen ? params.amount : 0n,
    }));
    const chosenLeg = at(legs, group.vaults.indexOf(chosen));
    if (!skip.has("balance")) {
      await this.#assertBalance(direction, legs, chosenLeg, account);
    }

    const operation = ENCRYPT_OPERATION[direction];
    const joinOperation: TransactionOperation =
      router === undefined ? "vault:join" : "vault:routerJoin";
    let configs: WriteContractConfig[];
    let spender: Address | undefined;
    if (router === undefined) {
      if (route === "pull") {
        // The batcher pulls the amount, so the proof is bound to the batcher.
        spender = chosenLeg.batcher;
        const [[handle], inputProof] = await this.#encrypt(
          chosenLeg.batcher,
          account,
          [params.amount],
          operation,
        );
        configs = [joinContract(chosenLeg.batcher, beneficiary, handle, inputProof)];
      } else {
        // One transfer per leg, its proof bound to the token it spends.
        const encrypted = await this.#encryptPerToken(legs, account, operation);
        configs = legs.map((leg) => {
          const { handle, inputProof } = encrypted(leg);
          return confidentialTransferAndCallContract(
            leg.token,
            leg.batcher,
            handle,
            inputProof,
            "0x",
          );
        });
      }
    } else {
      // The router verifies the allocation, so its proof is bound to the router.
      const [handles, routerProof] = await this.#encrypt(
        router,
        account,
        legs.map((leg) => leg.amount),
        operation,
      );
      const allocation = legs.map((leg, index) => ({
        batcher: leg.batcher,
        token: leg.token,
        amount: at(handles, index),
      }));
      if (direction === "redeem") {
        spender = router;
        configs = [routerJoinContract(router, allocation, routerProof)];
      } else {
        // The asset verifies the transfer of the total, under its own proof.
        const [[total], assetProof] = await this.#encrypt(
          group.asset,
          account,
          [params.amount],
          operation,
        );
        const data = encodeAllocationData(allocation, routerProof);
        configs = [
          confidentialTransferAndCallContract(group.asset, router, total, assetProof, data),
        ];
      }
    }
    const calls = configs.map((config) => ({ config, operation: joinOperation }));

    const { grants, expiresAt } =
      spender === undefined
        ? { grants: [], expiresAt: null }
        : await this.#grants(
            route === "pull" ? [chosenLeg.token] : [...new Set(tokens)],
            account,
            spender,
            options?.grantValiditySeconds,
          );
    return {
      kind: direction,
      groupId: group.id,
      direction,
      sender: account,
      beneficiary,
      grants,
      calls,
      atomic: calls.length > 1,
      expiresAt,
      legs: legs.map(({ vaultId, batcher }) => ({ vaultId, batcher })),
    };
  }

  async #planExit(record: VaultRecord<TConfig>): Promise<Plan> {
    const { legs } = await this.#readLegs(record, false);
    if (legs.some((leg) => leg.state === "dispatched")) {
      throw new VaultActionNotAllowedError(
        `A leg of this ${record.direction} in group "${record.groupId}" is dispatched; it can only be finalized until it settles`,
        { action: "exit", reason: "leg-dispatched" },
      );
    }
    const account = getAddress(record.account);
    const calls = legs.map(({ state, batcher, batchId }): PlannedCall => {
      switch (state) {
        case "pending":
          return { config: quitContract(batcher, batchId), operation: "vault:quit" };
        case "finalized":
          return { config: claimContract(batcher, batchId, account), operation: "vault:claim" };
        default:
          return { config: recoverContract(batcher, batchId, account), operation: "vault:recover" };
      }
    });
    return {
      kind: "exit",
      groupId: record.groupId,
      // `quit` refunds the sender, so only the account can quit its pending legs.
      sender: legs.some((leg) => leg.state === "pending") ? account : null,
      grants: [],
      calls,
      atomic: false,
      expiresAt: null,
    };
  }

  async #planDispatch(record: VaultRecord<TConfig>): Promise<Plan> {
    const { legs, now } = await this.#readLegs(record, false);
    const calls = legs.flatMap((leg): PlannedCall[] =>
      leg.state === "pending" && !leg.paused && leg.dispatchableAt <= now
        ? [{ config: dispatchBatchContract(leg.batcher), operation: "vault:dispatchBatch" }]
        : [],
    );
    if (calls.length === 0) {
      throw new VaultActionNotAllowedError(
        `No leg of this ${record.direction} in group "${record.groupId}" can be dispatched now`,
        { action: "dispatch", reason: "nothing-to-dispatch" },
      );
    }
    return {
      kind: "dispatch",
      groupId: record.groupId,
      sender: null,
      grants: [],
      calls,
      atomic: false,
      expiresAt: null,
    };
  }

  async #planFinalize(record: VaultRecord<TConfig>): Promise<Plan> {
    const { legs } = await this.#readLegs(record, false);
    const dispatched = legs.filter((leg) => leg.state === "dispatched");
    if (dispatched.length === 0) {
      throw new VaultActionNotAllowedError(
        `No leg of this ${record.direction} in group "${record.groupId}" is dispatched`,
        { action: "finalize", reason: "nothing-to-finalize" },
      );
    }
    await this.#requireProviderChain("vault finalize");
    const calls = await Promise.all(
      dispatched.map(async ({ batcher, batchId }): Promise<PlannedCall> => {
        const [requestId, wrapper] = await Promise.all([
          this.#read(unwrapRequestIdContract(batcher, batchId)),
          this.#read(fromTokenContract(batcher)),
        ]);
        const handle = await this.#read(unwrapAmountContract(getAddress(wrapper), requestId));
        // One proof per callback: each batcher verifies a proof over its own handle only.
        const { clearValues, decryptionProof } = await this.sdk.decryption.decryptPublicValues(
          [handle],
          { operation: "vault-finalize" },
        );
        const cleartext = clearValues[handle];
        if (cleartext === undefined) {
          throw new DecryptionFailedError(`Public decryption returned no value for ${handle}`);
        }
        assertBigint(cleartext, "finalize: clearValues[handle]");
        return {
          config: dispatchBatchCallbackContract(batcher, batchId, cleartext, decryptionProof),
          operation: "vault:finalize",
        };
      }),
    );
    return {
      kind: "finalize",
      groupId: record.groupId,
      sender: null,
      grants: [],
      calls,
      atomic: false,
      expiresAt: null,
    };
  }

  // SENDING

  #prepared(plan: Plan): PreparedVaultAction<GroupId<TConfig>> {
    return {
      v: 1,
      kind: plan.kind,
      chainId: this.chainId,
      groupId: plan.groupId as GroupId<TConfig>,
      sender: plan.sender,
      grants: plan.grants.map(toCall),
      calls: plan.calls.map(toCall),
      atomic: plan.atomic,
      expiresAt: plan.expiresAt,
    };
  }

  async #join(
    direction: Direction,
    params: VaultJoinParams<TConfig>,
    options: JoinOptions | undefined,
  ): Promise<JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>> {
    const plan = await this.#planJoin(direction, params, {
      skipChecks: options?.skipChecks,
      grantValiditySeconds: options?.grantValiditySeconds,
    });
    // The SDK only sends a join as one call, so the last receipt holds every leg's `Joined` log.
    const { txHashes, last } = await this.#submit(plan, options?.onJoinSubmitted);
    const logs = [...last.receipt.logs];
    const legs: JoinLeg[] = [];
    const unconfirmed: string[] = [];
    for (const { vaultId, batcher } of plan.legs) {
      const batchId = takeJoinedBatchId(logs, batcher, plan.beneficiary);
      if (batchId === null) {
        unconfirmed.push(vaultId);
      } else {
        legs.push({ vaultId, batcher, batchId });
      }
    }
    if (unconfirmed.length > 0) {
      throw new VaultJoinUnconfirmedError(
        `Transaction ${last.txHash} was mined, but its receipt has no Joined event for ${plan.beneficiary} from the batcher of ${unconfirmed.map((id) => `"${id}"`).join(", ")} in group "${plan.groupId}"`,
        { txHash: last.txHash, receipt: last.receipt, unconfirmedVaultIds: unconfirmed },
      );
    }
    return {
      record: {
        v: 1,
        chainId: this.chainId,
        groupId: plan.groupId,
        direction,
        account: plan.beneficiary,
        legs,
      } as JoinRecord<GroupId<TConfig>, VaultId<TConfig>>,
      txHashes,
    };
  }

  async #send(plan: Plan): Promise<ActionOutcome> {
    return { txHashes: (await this.#submit(plan)).txHashes };
  }

  async #submit(plan: Plan, onLastSubmitted?: (txHash: Hex) => void) {
    const signer = this.#signer(plan.kind);
    const wallet = getAddress(
      (await requireWriteChain(`vault ${plan.kind}`, signer, this.sdk.provider, this.chainId))
        .address,
    );
    if (plan.sender !== null && plan.sender !== wallet) {
      throw new ConfigurationError(
        `This vault ${plan.kind} must be sent by ${plan.sender}, but the signer is ${wallet}`,
      );
    }
    if (plan.atomic) {
      throw new ConfigurationError(
        `This vault ${plan.kind} has ${plan.calls.length} calls that must land atomically, which the SDK signer cannot do; prepare it and send it as one bundle`,
      );
    }
    // Grants first, then the calls, one prompt each.
    const all = [...plan.grants, ...plan.calls];
    const results: TransactionResult[] = [];
    for (const [index, call] of all.entries()) {
      results.push(
        await submitTransaction({
          operation: call.operation,
          signer,
          provider: this.sdk.provider,
          config: call.config,
          onSubmitted: index === all.length - 1 ? onLastSubmitted : undefined,
          emit: (input) => this.sdk.emitEvent(input, call.config.address),
          logger: this.sdk.logger,
        }),
      );
    }
    const last = results.at(-1);
    assertNonNullable(last, `vault ${plan.kind}: last transaction`);
    return { txHashes: results.map((result) => result.txHash), last };
  }

  // READS

  async #readLegs(
    record: VaultRecord<TConfig>,
    decrypt: boolean,
  ): Promise<{ legs: Leg[]; now: bigint }> {
    this.#checkRecord(record);
    const account = getAddress(record.account);
    const [now, legs] = await Promise.all([
      this.sdk.provider.getBlockTimestamp(this.chainId),
      Promise.all(record.legs.map((leg) => this.#readLeg(leg, account))),
    ]);
    return { legs: decrypt ? await this.#decryptDeposits(legs) : legs, now };
  }

  // Every field whatever the state, so a read costs the same each time.
  async #readLeg(leg: JoinLeg, account: Address): Promise<Leg> {
    const batcher = getAddress(leg.batcher);
    const { batchId } = leg;
    const [state, createdAt, minAge, dispatchedAt, deadline, paused, rate, decimals, deposit] =
      await Promise.all([
        this.#read(batchStateContract(batcher, batchId)),
        this.#read(batchCreatedAtContract(batcher, batchId)),
        this.#read(batchMinBatchAgeContract(batcher, batchId)),
        this.#read(batchDispatchedAtContract(batcher, batchId)),
        this.#read(batchCallbackDeadlineContract(batcher, batchId)),
        this.#read(pausedContract(batcher)),
        this.#read(exchangeRateContract(batcher, batchId)),
        this.#memo(`decimals:${batcher}`, () => this.#read(exchangeRateDecimalsContract(batcher))),
        this.#read(depositsContract(batcher, batchId, account)),
      ]);
    const base = { vaultId: leg.vaultId, batcher, batchId, deposit, amount: null };
    switch (BATCH_STATES[state]) {
      case "pending":
        return { ...base, state: "pending", dispatchableAt: createdAt + minAge, paused };
      case "dispatched":
        return { ...base, state: "dispatched", cancelsAt: dispatchedAt + deadline };
      case "finalized":
        return { ...base, state: "finalized", exchangeRate: { rate, decimals } };
      case "canceled":
        return { ...base, state: "canceled" };
      default:
        throw new ConfigurationError(
          `Batcher ${batcher} returned unknown batch state ${state} for batch ${batchId}; is it a vault batcher?`,
        );
    }
  }

  // Decrypted together, so the relayer cannot tell which leg the user cares about.
  async #decryptDeposits(legs: readonly Leg[]): Promise<Leg[]> {
    const wanted = legs
      .filter((leg) => !isEncryptedValueZero(leg.deposit))
      .map((leg) => ({ encryptedValue: leg.deposit, contractAddress: leg.batcher }));
    if (wanted.length > 0) {
      await this.#requireProviderChain("vault readPosition");
    }
    const values =
      wanted.length > 0
        ? await this.sdk.decryption.decryptValues(wanted, { operation: "vault-deposit-of" })
        : {};
    return legs.map((leg) => {
      if (isEncryptedValueZero(leg.deposit)) {
        return { ...leg, amount: 0n };
      }
      const value = values[leg.deposit];
      if (value === undefined) {
        throw new DecryptionFailedError(`Decryption returned no value for ${leg.deposit}`);
      }
      assertBigint(value, "readPosition: deposit");
      return { ...leg, amount: value };
    });
  }

  // A record must name every vault of its group in config order, or an exit would miss a leg.
  #checkRecord(record: JoinRecord): void {
    if (record.chainId !== this.chainId) {
      throw new ConfigurationError(
        `Join record is for chain ${record.chainId}, but the vaults config is for chain ${this.chainId}`,
      );
    }
    const group = this.#group(record.groupId);
    const matches =
      record.legs.length === group.vaults.length &&
      record.legs.every(
        (leg, index) =>
          leg.vaultId === group.vaults[index]?.id &&
          batcherAddresses(historyOf(at(group.vaults, index), record.direction)).includes(
            getAddress(leg.batcher),
          ),
      );
    if (!matches) {
      throw new ConfigurationError(
        `Join record for group "${group.id}" does not have one leg per vault in config order, each on one of the vault's ${record.direction} batchers`,
      );
    }
  }

  #group(groupId: string): ResolvedGroup {
    const group = this.#groups.get(groupId);
    if (group === undefined) {
      throw new ConfigurationError(`The vaults config has no group "${groupId}"`);
    }
    return group;
  }

  #chosenVault(group: ResolvedGroup, vaultId: string | undefined): ResolvedVault {
    if (vaultId === undefined) {
      if (group.vaults.length > 1) {
        throw new ConfigurationError(
          `Group "${group.id}" has ${group.vaults.length} vaults; pass vaultId`,
        );
      }
      return at(group.vaults, 0);
    }
    const vault = group.vaults.find((candidate) => candidate.id === vaultId);
    if (vault === undefined) {
      throw new ConfigurationError(`Group "${group.id}" has no vault "${vaultId}"`);
    }
    return vault;
  }

  async #account(
    direction: Direction,
    requested: Address | undefined,
    skipBalance: boolean,
  ): Promise<Address> {
    if (requested !== undefined && skipBalance) {
      return getAddress(requested);
    }
    // The balance check decrypts as the signer, so it can only vouch for the signer's account.
    if (requested !== undefined && this.sdk.signer === undefined) {
      throw new ConfigurationError(
        `The balance check for ${requested} decrypts as the signer, and none is configured; pass skipChecks: ["balance"]`,
      );
    }
    const wallet = getAddress(
      (await requireAlignedWalletAccount(direction, this.sdk.signer, this.sdk.provider)).address,
    );
    if (requested !== undefined && getAddress(requested) !== wallet) {
      throw new ConfigurationError(
        `The balance check for ${requested} decrypts as the signer's account ${wallet}; pass skipChecks: ["balance"] for another account`,
      );
    }
    return wallet;
  }

  #signer(operation: string): GenericSigner {
    if (this.sdk.signer === undefined) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.sdk.signer;
  }

  #router(): Address {
    const canonical = this.sdk.chains.find(
      (chain) => chain.id === this.chainId,
    )?.vaultRouterAddress;
    const configured = this.config.router;
    if (configured === undefined && canonical === undefined) {
      throw new ConfigurationError(
        `Chain ${this.chainId} has no vault router; set router in the vaults config`,
      );
    }
    if (
      configured !== undefined &&
      canonical !== undefined &&
      getAddress(configured) !== getAddress(canonical)
    ) {
      throw new ConfigurationError(
        `The vaults config names router ${getAddress(configured)}, but the router on chain ${this.chainId} is ${getAddress(canonical)}`,
      );
    }
    const router = configured ?? canonical;
    assertNonNullable(router, "vault router");
    return getAddress(router);
  }

  async #requireProviderChain(operation: string): Promise<void> {
    const providerChainId = await this.sdk.provider.getChainId();
    if (providerChainId !== this.chainId) {
      throw new ConfigurationError(
        `Operation "${operation}" encrypts or decrypts on chain ${this.chainId}, but the provider is on chain ${providerChainId}; switch to chain ${this.chainId} first`,
      );
    }
  }

  // The token each leg spends: the asset for a deposit, the vault's share token for a redeem.
  async #legTokens(group: ResolvedGroup, direction: Direction): Promise<Address[]> {
    if (direction === "deposit") {
      return group.vaults.map(() => group.asset);
    }
    return Promise.all(
      group.vaults.map((vault) =>
        this.#memo(`share:${vault.redeem.latest}`, async () =>
          getAddress(await this.#read(fromTokenContract(vault.redeem.latest))),
        ),
      ),
    );
  }

  // Once per group: every batcher of a vault, retired ones included, trades the group's asset
  // for one share token, against one ERC-4626 vault, and no two vaults share that vault.
  async #verifyGroup(group: ResolvedGroup): Promise<void> {
    await this.#memo(`verified:${group.id}`, async () => {
      const report = async (batcher: Address) =>
        (
          await Promise.all([
            this.#read(fromTokenContract(batcher)),
            this.#read(toTokenContract(batcher)),
            this.#read(vaultContract(batcher)),
          ])
        ).map((address) => getAddress(address));
      const vaults = await Promise.all(
        group.vaults.map(async (vault) => {
          const where = `Vault "${vault.id}" of group "${group.id}"`;
          const [deposits, redeems] = await Promise.all([
            Promise.all(batcherAddresses(vault.deposit).map(report)),
            Promise.all(batcherAddresses(vault.redeem).map(report)),
          ]);
          // Deposit batchers take the asset and pay the share; redeem batchers the reverse.
          const sides = [
            ...deposits.map(([taken, paid, erc4626]) => ({ asset: taken, share: paid, erc4626 })),
            ...redeems.map(([taken, paid, erc4626]) => ({ asset: paid, share: taken, erc4626 })),
          ];
          const first = at(sides, 0);
          for (const side of sides) {
            if (side.asset !== group.asset) {
              throw new ConfigurationError(
                `${where} has a batcher paired with ${side.asset}, not the group's asset ${group.asset}`,
              );
            }
            if (side.share !== first.share || side.erc4626 !== first.erc4626) {
              throw new ConfigurationError(
                `${where} has batchers that disagree on its share token or ERC-4626 vault`,
              );
            }
          }
          return first.erc4626;
        }),
      );
      const twice = duplicate(vaults);
      if (twice !== undefined) {
        throw new ConfigurationError(
          `Group "${group.id}" has two vaults whose batchers report the same vault ${twice}`,
        );
      }
    });
  }

  /**
   * The batcher a join reaches now: the first retired one whose `currentBatchId` is still at most
   * its `lastBatchId`, else the latest. Read on every join, never cached: the switch happens when
   * the last configured batch is dispatched.
   */
  async #activeBatcher(vault: ResolvedVault, direction: Direction): Promise<Address> {
    const history = historyOf(vault, direction);
    const current = await Promise.all(
      history.retired.map((entry) => this.#read(currentBatchIdContract(entry.address))),
    );
    return (
      history.retired.find((entry, index) => at(current, index) <= entry.lastBatchId)?.address ??
      history.latest
    );
  }

  // One paused batcher reverts the whole join, so every leg's batcher is read. Never skipped.
  async #assertNotPaused(group: ResolvedGroup, batchers: readonly Address[]): Promise<void> {
    const paused = await Promise.all(
      batchers.map((batcher) => this.#read(pausedContract(batcher))),
    );
    const index = paused.indexOf(true);
    if (index !== -1) {
      const vault = at(group.vaults, index);
      const batcher = at(batchers, index);
      throw new VaultBatcherPausedError(
        `Batcher ${batcher} of vault "${vault.id}" in group "${group.id}" is paused, so no vault of the group can be joined until it resumes`,
        { batcher, vaultId: vault.id },
      );
    }
  }

  // The router rejects a push of an unlisted token with a revert that costs a transaction. Not cached: a listing can be revoked.
  async #assertAssetListed(group: ResolvedGroup, router: Address): Promise<void> {
    const registry = await this.#memo(`registry:${router}`, async () =>
      getAddress(await this.#read(tokenWrapperRegistryContract(router))),
    );
    if (!(await this.#read(isConfidentialTokenValidContract(registry, group.asset)))) {
      throw new UnlistedConfidentialTokenError(
        `The vault router's registry does not list ${group.asset}, so it would reject a transfer of it`,
        { token: group.asset, registry },
      );
    }
  }

  // A short balance joins every batch with nothing and still costs the transaction.
  async #assertBalance(
    direction: Direction,
    legs: readonly PlannedLeg[],
    chosen: PlannedLeg,
    account: Address,
  ): Promise<void> {
    await assertConfidentialBalance({
      operation: direction,
      tokenAddress: chosen.token,
      amount: chosen.amount,
      account,
      signer: this.sdk.signer,
      provider: this.sdk.provider,
      // Every leg's token is decrypted, not only the chosen one's: a lone decrypt would tell the relayer which vault was picked.
      readBalance: async (owner) => {
        const tokens = [...new Set(legs.map((leg) => leg.token))].map(
          (address) => new Token(this.sdk, address),
        );
        const { results, errors } = await Token.batchBalancesOf(tokens, owner);
        const balance = results.get(chosen.token);
        if (balance === undefined) {
          throw (
            errors.get(chosen.token) ??
            new BalanceCheckUnavailableError(`Balance validation failed (token: ${chosen.token})`)
          );
        }
        return balance;
      },
    });
  }

  async #encrypt(
    contractAddress: Address,
    account: Address,
    values: readonly bigint[],
    operation: TelemetryOperation,
  ): Promise<readonly [readonly [EncryptedValue, ...EncryptedValue[]], Hex]> {
    const { encryptedValues, inputProof } = await this.sdk.encrypt(
      {
        values: values.map((value) => ({ value, type: "euint64" as const })),
        contractAddress,
        userAddress: account,
      },
      { operation },
    );
    const [first, ...rest] = encryptedValues;
    if (first === undefined || encryptedValues.length !== values.length) {
      throw new EncryptionFailedError(
        `Encryption returned ${encryptedValues.length} values for ${values.length} legs`,
      );
    }
    return [[first, ...rest], inputProof];
  }

  // A transfer's proof is bound to the token it spends: one proof covers legs that share a token.
  async #encryptPerToken(
    legs: readonly PlannedLeg[],
    account: Address,
    operation: TelemetryOperation,
  ): Promise<(leg: PlannedLeg) => { readonly handle: EncryptedValue; readonly inputProof: Hex }> {
    const byLeg = new Map<PlannedLeg, { handle: EncryptedValue; inputProof: Hex }>();
    await Promise.all(
      [...new Set(legs.map((leg) => leg.token))].map(async (token) => {
        const spending = legs.filter((leg) => leg.token === token);
        const [handles, inputProof] = await this.#encrypt(
          token,
          account,
          spending.map((leg) => leg.amount),
          operation,
        );
        spending.forEach((leg, index) =>
          byLeg.set(leg, { handle: at(handles, index), inputProof }),
        );
      }),
    );
    return (leg) => {
      const encrypted = byLeg.get(leg);
      assertNonNullable(encrypted, `vault leg ${leg.vaultId}`);
      return encrypted;
    };
  }

  // Grants the account lacks, for the spender on each token, valid for a window of chain time.
  async #grants(
    tokens: readonly Address[],
    account: Address,
    spender: Address,
    validitySeconds = DEFAULT_GRANT_VALIDITY_SECONDS,
  ): Promise<{ grants: PlannedCall[]; expiresAt: bigint | null }> {
    const granted = await Promise.all(
      tokens.map((token) => this.#read(isOperatorContract(token, account, spender))),
    );
    const missing = tokens.filter((_token, index) => !granted[index]);
    if (missing.length === 0) {
      return { grants: [], expiresAt: null };
    }
    // The token compares the deadline against the block's time, not the local clock.
    const until =
      (await this.sdk.provider.getBlockTimestamp(this.chainId)) + BigInt(validitySeconds);
    return {
      grants: missing.map((token) => ({
        config: setOperatorContract(token, spender, Number(until)),
        operation: "setOperator",
      })),
      expiresAt: until,
    };
  }

  #memo<T>(key: string, read: () => Promise<T>): Promise<T> {
    return memoize(this.#reads as Map<string, Promise<T>>, key, read);
  }

  #read<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(config: ReadContractConfig<TAbi, TFunctionName, TArgs>) {
    return this.sdk.provider.readContract({ ...config, chainId: this.chainId });
  }
}

/**
 * Bind a {@link defineVaults} config to an SDK. Reads nothing until first
 * used; the config is checked against the chain once per group, on its first
 * join.
 *
 * @example
 * ```ts
 * const client = createVaultClient(sdk, VAULTS);
 * const { record } = await client.deposit({ groupId: "stable", vaultId: "beta", amount: 1_000_000n });
 * const position = await client.readPosition(record);
 * if (position.availableActions.includes("exit")) await client.exit(record);
 * ```
 */
export function createVaultClient<const TConfig extends VaultsConfig>(
  sdk: ZamaSDK,
  config: TConfig,
): VaultClient<TConfig> {
  return new VaultClient(sdk, config);
}
