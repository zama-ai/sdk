import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import {
  confidentialTransferAndCallContract,
  isOperatorContract,
  setOperatorContract,
  unwrapAmountContract,
} from "../contracts";
import {
  BalanceCheckUnavailableError,
  ChainMismatchError,
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  VaultBatcherPausedError,
  VaultBatchNotDispatchedError,
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
import { requireWriteChain } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import { isEncryptedValueZero } from "../utils/handles";
import { submitTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import {
  historyOf,
  scopeOf,
  type BatcherHistory,
  type Vault,
  type VaultGroup,
  type VaultIdOf,
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
  pausedContract,
  quitContract,
  routerJoinContract,
  unwrapRequestIdContract,
} from "./contracts";
import { takeJoinedBatchId } from "./joined";
import type {
  Batch,
  BatchAction,
  BatchRef,
  BatchState,
  BatcherRef,
  Call,
  JoinCall,
  JoinDirection,
  GroupJoinInput,
  GroupJoinOptions,
  JoinInput,
  JoinOptions,
  JoinOutcome,
  JoinRoute,
  OpenBatch,
  OperatorApprovalCall,
  PreparedFinalize,
  PreparedJoin,
  SendJoinOptions,
  VaultCall,
  VaultLeg,
} from "./types";

// A router pulls a share token only for its holder's join, so a year-long approval is safe.
const OPERATOR_APPROVAL_VALIDITY_SECONDS = 365n * 24n * 60n * 60n;

// The contract's uint8 enum, by index.
const BATCH_STATES: readonly BatchState[] = ["pending", "dispatched", "finalized", "canceled"];

const ENCRYPT_OPERATION = {
  deposit: "vault-deposit",
  redeem: "vault-redeem",
} as const satisfies Record<JoinDirection, TelemetryOperation>;

const JOIN_OPERATION = {
  direct: "vault:join",
  router: "vault:routerJoin",
} as const satisfies Record<JoinRoute, TransactionOperation>;

// Arrays built in leg order line up with the legs, so a gap is an SDK bug, not a user error.
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  assertNonNullable(value, `vault leg ${index}`);
  return value;
}

function toCall(config: WriteContractConfig): Call {
  return {
    to: config.address,
    data: encodeFunctionData({
      abi: config.abi,
      functionName: config.functionName,
      args: config.args,
    } as Parameters<typeof encodeFunctionData>[0]),
    value: 0n,
  };
}

/** A join as the client plans it: a vault on its own has no `vaultId`. */
type AnyJoinInput = JoinInput & { readonly vaultId?: string };

function memberOf(group: VaultGroup, vaultId: string | undefined): Vault {
  const vault = group.vaults.find((candidate) => candidate.id === vaultId);
  if (vault === undefined) {
    throw new ConfigurationError(`Vault group "${group.id}" has no vault "${vaultId}"`);
  }
  return vault;
}

function nonEmpty<T>(values: readonly T[]): readonly [T, ...T[]] {
  const [first, ...rest] = values;
  assertNonNullable(first, "vault calls");
  return [first, ...rest];
}

interface Planned<TCall> {
  readonly call: TCall;
  readonly config: WriteContractConfig;
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

/** Builds and sends confidential vault transactions. */
export class VaultClient {
  readonly #sdk: ZamaSDK;

  readonly #reads = new Map<string, Promise<unknown>>();

  /** @internal Use {@link createVaultClient}. */
  constructor(sdk: ZamaSDK) {
    this.#sdk = sdk;
  }

  /**
   * Build a deposit into a vault on its own: one call, straight to its
   * deposit batcher, with the amount encrypted. The result is plain data, but
   * its bigints need a replacer to be JSON-encoded. Only `input.account` can
   * send the calls.
   *
   * @throws if the provider is not on the vault's chain while a wallet is connected. {@link ChainMismatchError}
   * @throws if the provider is on another chain with no wallet connected, or a batcher address is invalid. For a group: if the vault is unknown, the group has more than `MAX_GROUP_VAULTS` vaults, mixes chains or names a vault twice, the deposit batchers take different assets, or, on the router route, the chain has no router. {@link ConfigurationError}
   * @throws if a batcher the join reaches is paused, even with `skipBalanceCheck`. {@link VaultBatcherPausedError}
   * @throws if the balance is less than `amount` and `skipBalanceCheck` is not set. {@link InsufficientConfidentialBalanceError}
   * @throws if no signer is connected or `account` is not the signer's, so its balance cannot be decrypted; pass `skipBalanceCheck: true`. {@link BalanceCheckUnavailableError}
   */
  prepareDeposit(vault: Vault, input: JoinInput, options?: JoinOptions): Promise<PreparedJoin>;
  /**
   * Build a deposit of the group's asset into one of its vaults: a leg for
   * every vault, encrypted, with the calls in send order. The calls hold no
   * operator approval. With `route: "direct"`, send the joins as one atomic
   * bundle: sending only some shows which vault was chosen.
   *
   * @throws as the single-vault overload.
   */
  prepareDeposit<TGroup extends VaultGroup>(
    group: TGroup,
    input: GroupJoinInput<VaultIdOf<TGroup>>,
    options?: GroupJoinOptions,
  ): Promise<PreparedJoin>;
  async prepareDeposit(
    target: Vault | VaultGroup,
    input: AnyJoinInput,
    options?: GroupJoinOptions,
  ): Promise<PreparedJoin> {
    return (await this.#planJoin("deposit", target, input, options)).prepared;
  }

  /**
   * Build a redemption of a vault's shares on its own: one call, straight to
   * its redeem batcher. The result is plain data, but its bigints need a
   * replacer to be JSON-encoded. Only `input.account` can send the calls.
   *
   * @throws as {@link prepareDeposit}.
   */
  prepareRedeem(vault: Vault, input: JoinInput, options?: JoinOptions): Promise<PreparedJoin>;
  /**
   * Build a redemption of the shares of one vault of a group. On the router
   * route, `calls` starts with an operator approval, valid for a year, on each
   * share token the account has not approved. With `route: "direct"`, send the
   * joins as one atomic bundle: sending only some shows which vault was chosen.
   *
   * @throws as {@link prepareDeposit}.
   */
  prepareRedeem<TGroup extends VaultGroup>(
    group: TGroup,
    input: GroupJoinInput<VaultIdOf<TGroup>>,
    options?: GroupJoinOptions,
  ): Promise<PreparedJoin>;
  async prepareRedeem(
    target: Vault | VaultGroup,
    input: AnyJoinInput,
    options?: GroupJoinOptions,
  ): Promise<PreparedJoin> {
    return (await this.#planJoin("redeem", target, input, options)).prepared;
  }

  /**
   * Claim a finalized batch's output for `account`. Anyone may send it; the output always
   * goes to `account`. The output is the account's deposit times the batch's exchange rate,
   * rounded down; the deposit then reads as an encrypted zero.
   */
  prepareClaim(batch: BatchRef, account: Address): Call {
    return toCall(claimContract(getAddress(batch.batcher), batch.batchId, getAddress(account)));
  }

  /**
   * Take the sender's deposit back from a pending batch, or from a canceled
   * one. Only the depositor may send it, and it leaves the deposit as an
   * encrypted zero. After a group join, quit every leg of it: quitting only the
   * chosen one shows which vault was chosen.
   */
  prepareQuit(batch: BatchRef): Call {
    return toCall(quitContract(getAddress(batch.batcher), batch.batchId));
  }

  /** Close the batcher's open batch and start its decryption. Permissionless; reverts while too young or paused. */
  prepareDispatch(batch: BatcherRef): Call {
    return toCall(dispatchBatchContract(getAddress(batch.batcher)));
  }

  /**
   * Build the settlement of a dispatched batch with its publicly decrypted
   * amount. Permissionless. Past the batch's callback deadline the same call
   * cancels it instead.
   *
   * @throws if the batch is not dispatched. {@link VaultBatchNotDispatchedError}
   * @throws if the provider is not on the batch's chain while a wallet is connected. {@link ChainMismatchError}
   * @throws if the provider is not on the batch's chain with no wallet connected, or the batcher reports an unknown batch state. {@link ConfigurationError}
   * @throws if public decryption returns no value for the batch's handle. {@link DecryptionFailedError}
   */
  async prepareFinalize(batch: BatchRef): Promise<PreparedFinalize> {
    return (await this.#planFinalize(batch)).call;
  }

  async #planFinalize(batch: BatchRef): Promise<Planned<PreparedFinalize>> {
    const batcher = getAddress(batch.batcher);
    const [state, requestId, wrapper] = await Promise.all([
      this.#batchState(batch.chainId, batcher, batch.batchId),
      this.#read(batch.chainId, unwrapRequestIdContract(batcher, batch.batchId)),
      this.#fromToken(batch.chainId, batcher),
    ]);
    // Outside `dispatched` the request is unset or spent, so the decryption would fail opaquely.
    if (state !== "dispatched") {
      throw new VaultBatchNotDispatchedError(
        `Batch ${batch.batchId} of batcher ${batcher} is ${state}, but only a dispatched batch can be finalized`,
        { batcher, batchId: batch.batchId, state },
      );
    }
    const handle = await this.#read(batch.chainId, unwrapAmountContract(wrapper, requestId));
    await this.#requireProviderChain(batch.chainId, "vault finalize");
    const { clearValues, decryptionProof } = await this.#sdk.decryption.decryptPublicValues(
      [handle],
      { operation: "vault-finalize" },
    );
    const cleartext = clearValues[handle];
    if (cleartext === undefined) {
      throw new DecryptionFailedError(`Public decryption returned no value for ${handle}`);
    }
    assertBigint(cleartext, "finalize: clearValues[handle]");
    const config = dispatchBatchCallbackContract(
      batcher,
      batch.batchId,
      cleartext,
      decryptionProof,
    );
    return {
      config,
      call: {
        chainId: batch.chainId,
        batcher,
        batchId: batch.batchId,
        unwrapAmountCleartext: cleartext,
        decryptionProof,
        call: toCall(config),
      },
    };
  }

  /**
   * Deposit into a vault on its own with the SDK's signer, for the signer's
   * account.
   *
   * @throws as {@link prepareDeposit}.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if the wallet is not on the vault's chain. {@link ChainMismatchError}
   * @throws if the join was mined but its receipt does not confirm every leg. The join most likely
   *   went through: look the transaction up before joining again. {@link VaultJoinUnconfirmedError}
   */
  deposit(
    vault: Vault,
    input: Omit<JoinInput, "account">,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome>;
  /**
   * Deposit into one vault of a group with the SDK's signer, with a leg for
   * every vault.
   *
   * @throws as the single-vault overload.
   */
  deposit<TGroup extends VaultGroup>(
    group: TGroup,
    input: Omit<GroupJoinInput<VaultIdOf<TGroup>>, "account">,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome>;
  async deposit(
    target: Vault | VaultGroup,
    input: Omit<AnyJoinInput, "account">,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome> {
    return this.#join("deposit", target, input, options);
  }

  /**
   * Redeem a vault's shares on its own with the SDK's signer.
   *
   * @throws as {@link deposit}.
   */
  redeem(
    vault: Vault,
    input: Omit<JoinInput, "account">,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome>;
  /**
   * Redeem the shares of one vault of a group with the SDK's signer. It first
   * asks the wallet for each operator approval of the router the account lacks.
   *
   * @throws as {@link deposit}.
   */
  redeem<TGroup extends VaultGroup>(
    group: TGroup,
    input: Omit<GroupJoinInput<VaultIdOf<TGroup>>, "account">,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome>;
  async redeem(
    target: Vault | VaultGroup,
    input: Omit<AnyJoinInput, "account">,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome> {
    return this.#join("redeem", target, input, options);
  }

  /**
   * Claim a finalized batch with the SDK's signer, for `account` (default: the signer).
   * The output is the account's deposit times the batch's exchange rate, rounded down;
   * the deposit then reads as an encrypted zero.
   */
  async claim(batch: BatchRef, account?: Address): Promise<TransactionResult> {
    const signer = await this.#writeAccount(batch.chainId, "claim");
    const call = claimContract(
      getAddress(batch.batcher),
      batch.batchId,
      getAddress(account ?? signer),
    );
    return this.#send(call, "vault:claim");
  }

  /**
   * Quit a pending or canceled batch with the SDK's signer, which must be the depositor.
   * It leaves the deposit as an encrypted zero. After a group join, quit every leg of it:
   * quitting only the chosen one shows which vault was chosen.
   */
  async quit(batch: BatchRef): Promise<TransactionResult> {
    await this.#writeAccount(batch.chainId, "quit");
    return this.#send(quitContract(getAddress(batch.batcher), batch.batchId), "vault:quit");
  }

  /** Dispatch the batcher's open batch with the SDK's signer. */
  async dispatch(batch: BatcherRef): Promise<TransactionResult> {
    await this.#writeAccount(batch.chainId, "dispatch");
    return this.#send(dispatchBatchContract(getAddress(batch.batcher)), "vault:dispatchBatch");
  }

  /** Finalize a dispatched batch with the SDK's signer. */
  async finalize(batch: BatchRef): Promise<TransactionResult> {
    // Before the public decryption, so a wrong chain fails before the relayer round trip.
    await this.#writeAccount(batch.chainId, "finalize");
    return this.#send((await this.#planFinalize(batch)).config, "vault:finalize");
  }

  /**
   * One batch's state and timings, and what can be sent for it now. Pass
   * `account` to read its encrypted deposit and to list `claim` and `quit`.
   */
  async readBatch(batch: BatchRef, account?: Address): Promise<Batch> {
    const { chainId, batchId } = batch;
    const batcher = getAddress(batch.batcher);
    const depositor = account === undefined ? undefined : getAddress(account);
    const [state, createdAt, minAge, dispatchedAt, deadline, paused, rate, decimals, deposit, now] =
      await Promise.all([
        this.#batchState(chainId, batcher, batchId),
        this.#read(chainId, batchCreatedAtContract(batcher, batchId)),
        this.#read(chainId, batchMinBatchAgeContract(batcher, batchId)),
        this.#read(chainId, batchDispatchedAtContract(batcher, batchId)),
        this.#read(chainId, batchCallbackDeadlineContract(batcher, batchId)),
        this.#read(chainId, pausedContract(batcher)),
        this.#read(chainId, exchangeRateContract(batcher, batchId)),
        this.#memo(`decimals:${chainId}:${batcher}`, () =>
          this.#read(chainId, exchangeRateDecimalsContract(batcher)),
        ),
        depositor === undefined
          ? null
          : this.#read(chainId, depositsContract(batcher, batchId, depositor)),
        this.#sdk.provider.getBlockTimestamp(chainId),
      ]);
    const dispatchableAt = createdAt + minAge;
    const cancelsAt = dispatchedAt + deadline;
    // A literal zero handle means the account never joined this batch.
    const member = deposit !== null && !isEncryptedValueZero(deposit);
    const actions = (
      [
        ["claim", member && state === "finalized"],
        ["quit", member && (state === "pending" || state === "canceled")],
        ["dispatch", state === "pending" && !paused && dispatchableAt <= now],
        ["finalize", state === "dispatched"],
      ] as const
    ).flatMap(([action, allowed]): BatchAction[] => (allowed ? [action] : []));
    const edge = state === "pending" ? dispatchableAt : state === "dispatched" ? cancelsAt : null;
    const base = {
      chainId,
      batcher,
      batchId,
      createdAt,
      dispatchableAt,
      paused,
      deposit,
      actions,
      observedAt: now,
      nextChangeAt: edge !== null && edge > now ? edge : null,
    };
    switch (state) {
      case "pending":
        return { ...base, state };
      case "finalized":
        return { ...base, state, dispatchedAt, cancelsAt, exchangeRate: { rate, decimals } };
      default:
        return { ...base, state, dispatchedAt, cancelsAt };
    }
  }

  /** The open batch of a vault's active batcher, or of each vault of a group, with when it can be dispatched. */
  async readOpenBatches(
    target: Vault | VaultGroup,
    direction: JoinDirection,
  ): Promise<readonly OpenBatch[]> {
    const { vaults, chainId } = scopeOf(target);
    const [now, batches] = await Promise.all([
      this.#sdk.provider.getBlockTimestamp(chainId),
      Promise.all(
        vaults.map(async (vault) => {
          const batcher = await this.#activeBatcher(vault, direction);
          const [batchId, paused] = await Promise.all([
            this.#read(chainId, currentBatchIdContract(batcher)),
            this.#read(chainId, pausedContract(batcher)),
          ]);
          const [createdAt, minAge] = await Promise.all([
            this.#read(chainId, batchCreatedAtContract(batcher, batchId)),
            this.#read(chainId, batchMinBatchAgeContract(batcher, batchId)),
          ]);
          return {
            vaultId: vault.id,
            chainId,
            batcher,
            batchId,
            dispatchableAt: createdAt + minAge,
            paused,
          };
        }),
      ),
    ]);
    return batches.map((batch) => ({ ...batch, observedAt: now }));
  }

  async #planJoin(
    direction: JoinDirection,
    joinTarget: Vault | VaultGroup,
    input: AnyJoinInput,
    options: GroupJoinOptions | undefined,
  ): Promise<{ readonly prepared: PreparedJoin; readonly planned: readonly Planned<VaultCall>[] }> {
    const { group, vaults, chainId } = scopeOf(joinTarget);
    const chosen = group === undefined ? vaults[0] : memberOf(group, input.vaultId);
    const account = getAddress(input.account);
    const route: JoinRoute = group === undefined ? "direct" : (options?.route ?? "router");

    // Encryption runs on the provider's chain, so check it before anything prompts.
    await this.#requireProviderChain(chainId, `vault ${direction}`);
    const router = group !== undefined && route === "router" ? this.#router(group) : undefined;
    const batchers = await Promise.all(
      vaults.map((vault) => this.#activeBatcher(vault, direction)),
    );
    const [tokens] = await Promise.all([
      Promise.all(batchers.map((batcher) => this.#fromToken(chainId, batcher))),
      this.#assertNotPaused(chainId, group, vaults, batchers),
    ]);
    const legs = nonEmpty(
      vaults.map((vault, index): VaultLeg => ({
        vaultId: vault.id,
        batcher: at(batchers, index),
        token: at(tokens, index),
        amount: vault === chosen ? input.amount : 0n,
      })),
    );
    const target = at(legs, vaults.indexOf(chosen));
    // A group deposits one asset: the router transfers it once and splits it into the legs.
    const stray = legs.find((leg) => direction === "deposit" && leg.token !== target.token);
    if (stray !== undefined) {
      throw new ConfigurationError(
        `Vault group "${joinTarget.id}" mixes deposit assets: vault "${stray.vaultId}" takes ${stray.token}, vault "${target.vaultId}" takes ${target.token}`,
      );
    }
    if (options?.skipBalanceCheck !== true) {
      await this.#assertBalance(direction, legs, target, account);
    }

    const operation = ENCRYPT_OPERATION[direction];
    const join = (config: WriteContractConfig, leg: VaultLeg): Planned<JoinCall> => ({
      config,
      call: { ...toCall(config), kind: "join", leg },
    });
    let joins: Planned<JoinCall>[];
    let operatorApprovals: Planned<OperatorApprovalCall>[] = [];
    if (router !== undefined) {
      const amounts = legs.map((leg) => leg.amount);
      const allocationOf = (handles: readonly EncryptedValue[]) =>
        legs.map((leg, index) => ({
          batcher: leg.batcher,
          token: leg.token,
          amount: at(handles, index),
        }));
      if (direction === "redeem") {
        // The router verifies the allocation, so its proof is bound to the router.
        const [[handles, routerProof], missing] = await Promise.all([
          this.#encrypt(router, account, amounts, operation),
          this.#missingOperatorApprovals(chainId, legs, account, router),
        ]);
        operatorApprovals = missing;
        joins = [join(routerJoinContract(router, allocationOf(handles), routerProof), target)];
      } else {
        // One proof per verifying contract: the router checks the allocation, the asset the total.
        const asset = target.token;
        const [[handles, routerProof], [[total], assetProof]] = await Promise.all([
          this.#encrypt(router, account, amounts, operation),
          this.#encrypt(asset, account, [input.amount], operation),
        ]);
        const data = encodeAllocationData(allocationOf(handles), routerProof);
        joins = [
          join(confidentialTransferAndCallContract(asset, router, total, assetProof, data), target),
        ];
      }
    } else {
      const encrypted = await this.#encryptPerToken(legs, account, operation);
      joins = legs.map((leg, index) => {
        const { handle, inputProof } = at(encrypted, index);
        return join(
          confidentialTransferAndCallContract(leg.token, leg.batcher, handle, inputProof, "0x"),
          leg,
        );
      });
    }

    // Operator approvals first: the router pulls under them.
    const planned: Planned<VaultCall>[] = [...operatorApprovals, ...joins];
    return {
      prepared: {
        direction,
        chainId,
        groupId: group?.id,
        vaultId: chosen.id,
        account,
        amount: input.amount,
        route,
        legs,
        calls: nonEmpty(planned.map(({ call }) => call)),
      },
      planned,
    };
  }

  async #join(
    direction: JoinDirection,
    target: Vault | VaultGroup,
    input: Omit<AnyJoinInput, "account">,
    options: SendJoinOptions | undefined,
  ): Promise<JoinOutcome> {
    const signer = this.#signer(direction);
    const { chainId } = scopeOf(target);
    const account = await this.#writeAccount(chainId, direction);
    const { prepared, planned } = await this.#planJoin(
      direction,
      target,
      { ...input, account },
      { skipBalanceCheck: options?.skipBalanceCheck },
    );
    // The calls are any operator approvals, then a single join: the SDK never bundles.
    const txHashes: Hex[] = [];
    let last: TransactionResult | undefined;
    for (const [index, { call, config }] of planned.entries()) {
      last = await submitTransaction({
        operation:
          call.kind === "operatorApproval" ? "setOperator" : JOIN_OPERATION[prepared.route],
        signer,
        provider: this.#sdk.provider,
        config,
        onSubmitted: index === planned.length - 1 ? options?.onJoinSubmitted : undefined,
        emit: (event) => this.#sdk.emitEvent(event, call.to),
        logger: this.#sdk.logger,
      });
      txHashes.push(last.txHash);
    }
    assertNonNullable(last, `vault ${direction}: last transaction`);
    const logs = [...last.receipt.logs];
    const batches: (BatchRef & { vaultId: string })[] = [];
    const unconfirmed: string[] = [];
    for (const leg of prepared.legs) {
      const batchId = takeJoinedBatchId(logs, leg.batcher, account);
      if (batchId === null) {
        unconfirmed.push(leg.vaultId);
      } else {
        batches.push({ vaultId: leg.vaultId, chainId, batcher: leg.batcher, batchId });
      }
    }
    if (unconfirmed.length > 0) {
      throw new VaultJoinUnconfirmedError(
        `Transaction ${last.txHash} was mined, but its receipt has no Joined event for ${account} from the batcher of ${unconfirmed.map((id) => `vault "${id}"`).join(", ")}${"vaults" in target ? ` in group "${target.id}"` : ""}`,
        { txHash: last.txHash, receipt: last.receipt, unconfirmedVaultIds: unconfirmed },
      );
    }
    return { batches, txHashes };
  }

  // Never cached: the switch happens when the last configured batch is dispatched.
  async #activeBatcher(vault: Vault, direction: JoinDirection): Promise<Address> {
    const history: BatcherHistory = historyOf(vault, direction);
    const current = await Promise.all(
      history.retired.map((entry) =>
        this.#read(vault.chainId, currentBatchIdContract(entry.address)),
      ),
    );
    return (
      history.retired.find((entry, index) => at(current, index) <= entry.lastBatchId)?.address ??
      history.latest
    );
  }

  #router(group: VaultGroup): Address {
    const { chainId } = scopeOf(group);
    const router = this.#sdk.chains.find((chain) => chain.id === chainId)?.vaultRouterAddress;
    if (router === undefined) {
      throw new ConfigurationError(
        `Vault group "${group.id}" has ${group.vaults.length} vaults, but chain ${chainId} has no router; set vaultRouterAddress on the chain`,
      );
    }
    return getAddress(router);
  }

  // Fixed at deployment, so read once.
  #fromToken(chainId: number, batcher: Address): Promise<Address> {
    return this.#memo(`fromToken:${chainId}:${batcher}`, async () =>
      getAddress(await this.#read(chainId, fromTokenContract(batcher))),
    );
  }

  // One paused batcher reverts the whole join, so every leg's batcher is read.
  async #assertNotPaused(
    chainId: number,
    group: VaultGroup | undefined,
    vaults: readonly Vault[],
    batchers: readonly Address[],
  ): Promise<void> {
    const paused = await Promise.all(
      batchers.map((batcher) => this.#read(chainId, pausedContract(batcher))),
    );
    const index = paused.indexOf(true);
    if (index !== -1) {
      const vault = at(vaults, index);
      const batcher = at(batchers, index);
      throw new VaultBatcherPausedError(
        group !== undefined
          ? `Batcher ${batcher} of vault "${vault.id}" in group "${group.id}" is paused, so no vault of the group can be joined until it resumes`
          : `Batcher ${batcher} of vault "${vault.id}" is paused, so the vault cannot be joined until it resumes`,
        { batcher, vaultId: vault.id },
      );
    }
  }

  // A short balance joins every batch with nothing and still costs the transaction.
  async #assertBalance(
    direction: JoinDirection,
    legs: readonly VaultLeg[],
    target: VaultLeg,
    account: Address,
  ): Promise<void> {
    // Only the signer can decrypt its own balance; throwing keeps skipping the check explicit.
    const signerAccount = this.#sdk.signer?.walletAccount.getSnapshot()?.address;
    if (signerAccount === undefined || getAddress(signerAccount) !== account) {
      throw new BalanceCheckUnavailableError(
        `Cannot check the balance of ${account} for a vault ${direction}: ${
          signerAccount === undefined ? "no signer is connected" : "the signer is another account"
        }. Check it yourself, decrypting every leg's token together, and pass skipBalanceCheck: true`,
      );
    }
    await assertConfidentialBalance({
      operation: direction,
      tokenAddress: target.token,
      amount: target.amount,
      account,
      signer: this.#sdk.signer,
      provider: this.#sdk.provider,
      // Every leg's token is decrypted, not only the chosen one's: a lone decrypt would tell the relayer which vault was picked.
      readBalance: async (owner) => {
        const tokens = [...new Set(legs.map((leg) => leg.token))].map(
          (address) => new Token(this.#sdk, address),
        );
        const { results, errors } = await Token.batchBalancesOf(tokens, owner);
        const balance = results.get(target.token);
        if (balance === undefined) {
          throw (
            errors.get(target.token) ??
            new BalanceCheckUnavailableError(`Balance validation failed (token: ${target.token})`)
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
    const { encryptedValues, inputProof } = await this.#sdk.encrypt(
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

  // A transfer's proof is bound to the token it spends: one proof covers the legs that share a token.
  async #encryptPerToken(
    legs: readonly VaultLeg[],
    account: Address,
    operation: TelemetryOperation,
  ): Promise<{ readonly handle: EncryptedValue; readonly inputProof: Hex }[]> {
    const byLeg = new Map<VaultLeg, { handle: EncryptedValue; inputProof: Hex }>();
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
    return legs.map((leg) => {
      const encrypted = byLeg.get(leg);
      assertNonNullable(encrypted, `vault leg ${leg.vaultId}`);
      return encrypted;
    });
  }

  async #missingOperatorApprovals(
    chainId: number,
    legs: readonly VaultLeg[],
    account: Address,
    operator: Address,
  ): Promise<Planned<OperatorApprovalCall>[]> {
    const approved = await Promise.all(
      legs.map((leg) => this.#read(chainId, isOperatorContract(leg.token, account, operator))),
    );
    const missing = legs.filter((_leg, index) => !approved[index]);
    if (missing.length === 0) {
      return [];
    }
    // The token compares the deadline against the block's time, not the local clock.
    const until =
      (await this.#sdk.provider.getBlockTimestamp(chainId)) + OPERATOR_APPROVAL_VALIDITY_SECONDS;
    return missing.map((leg) => {
      const config = setOperatorContract(leg.token, operator, Number(until));
      return {
        config,
        call: {
          ...toCall(config),
          kind: "operatorApproval",
          vaultId: leg.vaultId,
          operator,
          until,
        },
      };
    });
  }

  async #batchState(chainId: number, batcher: Address, batchId: bigint): Promise<BatchState> {
    const index = await this.#read(chainId, batchStateContract(batcher, batchId));
    const state = BATCH_STATES[index];
    if (state === undefined) {
      throw new ConfigurationError(
        `Batcher ${batcher} returned unknown batch state ${index} for batch ${batchId}; is it a vault batcher?`,
      );
    }
    return state;
  }

  #signer(operation: string): GenericSigner {
    if (this.#sdk.signer === undefined) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#sdk.signer;
  }

  // A write must not land on a chain other than the batcher's.
  async #writeAccount(chainId: number, operation: string): Promise<Address> {
    const account = await requireWriteChain(
      `vault ${operation}`,
      this.#signer(operation),
      this.#sdk.provider,
      chainId,
    );
    return getAddress(account.address);
  }

  async #send(
    config: WriteContractConfig,
    operation: TransactionOperation,
  ): Promise<TransactionResult> {
    return submitTransaction({
      operation,
      signer: this.#signer(operation),
      provider: this.#sdk.provider,
      config,
      emit: (event) => this.#sdk.emitEvent(event, config.address),
      logger: this.#sdk.logger,
    });
  }

  async #requireProviderChain(chainId: number, operation: string): Promise<void> {
    const providerChainId = await this.#sdk.provider.getChainId();
    if (providerChainId === chainId) {
      return;
    }
    // A connected wallet gets the same error as a send, so an app has one "switch chain" case.
    const wallet = this.#sdk.signer?.walletAccount.getSnapshot();
    if (wallet !== undefined) {
      throw new ChainMismatchError({
        operation,
        signerChainId: wallet.chainId,
        providerChainId,
        targetChainId: chainId,
      });
    }
    throw new ConfigurationError(
      `Operation "${operation}" encrypts or decrypts on chain ${chainId}, but the provider is on chain ${providerChainId}`,
    );
  }

  #memo<T>(key: string, read: () => Promise<T>): Promise<T> {
    return memoize(this.#reads as Map<string, Promise<T>>, key, read);
  }

  #read<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(chainId: number, config: ReadContractConfig<TAbi, TFunctionName, TArgs>) {
    return this.#sdk.provider.readContract({ ...config, chainId });
  }
}

/**
 * A {@link VaultClient} bound to `sdk`. Reads nothing until first used.
 */
export function createVaultClient(sdk: ZamaSDK): VaultClient {
  return new VaultClient(sdk);
}
