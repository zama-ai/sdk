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
  toGroup,
  type BatcherHistory,
  type VaultGroup,
  type VaultGroupVault,
  type VaultTarget,
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
  JoinInput,
  JoinInputFor,
  JoinOptions,
  JoinOutcome,
  JoinRoute,
  OpenBatch,
  OperatorApprovalCall,
  PreparedFinalize,
  PreparedJoin,
  SendJoinInputFor,
  SendJoinOptions,
  VaultCall,
  VaultLeg,
} from "./types";

/** A router pulls a share token only for a join its holder sends, so a year-long operator approval exposes nothing and saves a prompt on later redeems. */
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

// A single vault is the only vault of its group, so a join into it needs no `vaultId`.
function withVaultId<TInput extends { readonly vaultId?: string }>(
  target: VaultTarget,
  input: TInput,
): TInput & { readonly vaultId: string | undefined } {
  return { ...input, vaultId: input.vaultId ?? ("vaults" in target ? undefined : target.id) };
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

/**
 * Builds and sends confidential vault transactions. Holds no config: every
 * method takes the group, the single vault or the batch it acts on, so one client
 * serves every chain and group.
 *
 * `prepare*` methods return plain calls for a host that sends through its own
 * pipeline. They need no signer, except to check the balance of a join. The
 * methods named by the bare verb send through the SDK's signer.
 *
 * Every join sends a leg to every vault of its group, the chosen one with the
 * amount and the rest with an encrypted zero, so the chain cannot tell which
 * vault was chosen. Batch actions act on one batch: to keep the choice private
 * when quitting, quit every leg of the join, not only the chosen one.
 */
export class VaultClient {
  readonly #sdk: ZamaSDK;

  readonly #reads = new Map<string, Promise<unknown>>();

  /** @internal Use {@link createVaultClient}. */
  constructor(sdk: ZamaSDK) {
    this.#sdk = sdk;
  }

  /**
   * Build a deposit of the group's asset into one vault: a leg for every
   * vault, encrypted, with the calls in send order. A deposit pushes the
   * asset, so it needs no operator approval.
   *
   * @throws if the provider is not on the group's chain while a wallet is connected. {@link ChainMismatchError}
   * @throws if the vault is unknown, the deposit batchers take different assets, a multi-vault group's chain has no router, or the provider is on another chain with no wallet connected. {@link ConfigurationError}
   * @throws if any vault's batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if `account` is not the signer's, so its balance cannot be decrypted; pass `skipBalanceCheck: true`. {@link BalanceCheckUnavailableError}
   */
  async prepareDeposit<TTarget extends VaultTarget>(
    target: TTarget,
    input: JoinInputFor<TTarget>,
    options?: JoinOptions,
  ): Promise<PreparedJoin> {
    return (await this.#planJoin("deposit", target, input, options)).prepared;
  }

  /**
   * Build a redemption of one vault's shares. On the router route the router
   * pulls every leg's share token, so `calls` starts with an operator approval on each
   * share token the account has not approved, valid for a year.
   *
   * @throws as {@link prepareDeposit}.
   */
  async prepareRedeem<TTarget extends VaultTarget>(
    target: TTarget,
    input: JoinInputFor<TTarget>,
    options?: JoinOptions,
  ): Promise<PreparedJoin> {
    return (await this.#planJoin("redeem", target, input, options)).prepared;
  }

  /** Claim a finalized batch's output for `account`. Anyone may send it; the output always goes to `account`. */
  prepareClaim(batch: BatchRef, account: Address): Call {
    return toCall(claimContract(getAddress(batch.batcher), batch.batchId, getAddress(account)));
  }

  /**
   * Take the sender's deposit back from a pending batch, or from a canceled
   * one. The contract refunds the sender, so only the depositor may send it.
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
   * @throws if the provider is not on the batch's chain with no wallet connected. {@link ConfigurationError}
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
   * Deposit with the SDK's signer: prepare for the signer's account, send the
   * calls, and read the batch each leg landed in from the receipt.
   *
   * @throws as {@link prepareDeposit}.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if the wallet is not on the group's chain. {@link ChainMismatchError}
   * @throws if the receipt does not confirm every leg. {@link VaultJoinUnconfirmedError}
   */
  async deposit<TTarget extends VaultTarget>(
    target: TTarget,
    input: SendJoinInputFor<TTarget>,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome> {
    return this.#join("deposit", target, input, options);
  }

  /**
   * Redeem with the SDK's signer. In a group of more than one vault, a
   * redemption first asks the wallet for each operator approval of the router the account lacks.
   *
   * @throws as {@link deposit}.
   */
  async redeem<TTarget extends VaultTarget>(
    target: TTarget,
    input: SendJoinInputFor<TTarget>,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome> {
    return this.#join("redeem", target, input, options);
  }

  /** Claim a finalized batch with the SDK's signer, for `account` (default: the signer). */
  async claim(batch: BatchRef, account?: Address): Promise<TransactionResult> {
    const signer = await this.#writeAccount(batch.chainId, "claim");
    const call = claimContract(
      getAddress(batch.batcher),
      batch.batchId,
      getAddress(account ?? signer),
    );
    return this.#send(call, "vault:claim");
  }

  /** Quit a pending or canceled batch with the SDK's signer, which must be the depositor. */
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
   * One batch's state and timings, in one round of reads, and what can be
   * sent for it now. Pass `account` to read its encrypted deposit and to list
   * `claim` and `quit`.
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

  /** The open batch of each vault's active batcher, with when it can be dispatched. */
  async readOpenBatches(
    target: VaultTarget,
    direction: JoinDirection,
  ): Promise<readonly OpenBatch[]> {
    const group = toGroup(target);
    const { chainId } = group;
    const [now, batches] = await Promise.all([
      this.#sdk.provider.getBlockTimestamp(chainId),
      Promise.all(
        group.vaults.map(async (vault) => {
          const batcher = await this.#activeBatcher(group, vault, direction);
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

  // Each call stays paired with the ABI config it was encoded from: the SDK signer sends configs, a
  // host sends the encoded calls.
  async #planJoin(
    direction: JoinDirection,
    joinTarget: VaultTarget,
    joinInput: Omit<JoinInput, "vaultId"> & { readonly vaultId?: string },
    options: JoinOptions | undefined,
  ): Promise<{ readonly prepared: PreparedJoin; readonly planned: readonly Planned<VaultCall>[] }> {
    const group = toGroup(joinTarget);
    const input = withVaultId(joinTarget, joinInput);
    const chosen = group.vaults.find((vault) => vault.id === input.vaultId);
    if (chosen === undefined) {
      throw new ConfigurationError(`Vault group "${group.id}" has no vault "${input.vaultId}"`);
    }
    const account = getAddress(input.account);
    const route: JoinRoute = group.vaults.length === 1 ? "direct" : (options?.route ?? "router");

    // Encryption runs on the provider's chain, so check it before anything prompts.
    await this.#requireProviderChain(group.chainId, `vault ${direction}`);
    const router = route === "router" ? this.#router(group) : undefined;
    const batchers = await Promise.all(
      group.vaults.map((vault) => this.#activeBatcher(group, vault, direction)),
    );
    const [tokens] = await Promise.all([
      Promise.all(batchers.map((batcher) => this.#fromToken(group.chainId, batcher))),
      this.#assertNotPaused(group, batchers),
    ]);
    const legs = nonEmpty(
      group.vaults.map((vault, index): VaultLeg => ({
        vaultId: vault.id,
        batcher: at(batchers, index),
        token: at(tokens, index),
        amount: vault === chosen ? input.amount : 0n,
      })),
    );
    const target = at(legs, group.vaults.indexOf(chosen));
    // A group deposits one asset: the router transfers it once and splits it into the legs.
    const stray = legs.find((leg) => direction === "deposit" && leg.token !== target.token);
    if (stray !== undefined) {
      throw new ConfigurationError(
        `Vault group "${group.id}" mixes deposit assets: vault "${stray.vaultId}" takes ${stray.token}, vault "${target.vaultId}" takes ${target.token}`,
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
          this.#missingOperatorApprovals(group.chainId, legs, account, router),
        ]);
        operatorApprovals = missing;
        joins = [join(routerJoinContract(router, allocationOf(handles), routerProof), target)];
      } else {
        // One proof per verifying contract: the router checks the allocation, the asset the
        // transfer of the total, which must equal the allocation's sum.
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

    // Operator approvals first: the router or batcher pulls under them.
    const planned: Planned<VaultCall>[] = [...operatorApprovals, ...joins];
    return {
      prepared: {
        direction,
        chainId: group.chainId,
        groupId: group.id,
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
    target: VaultTarget,
    input: Omit<JoinInput, "vaultId" | "account"> & { readonly vaultId?: string },
    options: SendJoinOptions | undefined,
  ): Promise<JoinOutcome> {
    const group = toGroup(target);
    const signer = this.#signer(direction);
    const account = await this.#writeAccount(group.chainId, direction);
    const { prepared, planned } = await this.#planJoin(
      direction,
      target,
      { ...input, account },
      { skipBalanceCheck: options?.skipBalanceCheck },
    );
    // The SDK sends one call at a time and never bundles, so the calls are any operator approvals, then a single join.
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
        batches.push({
          vaultId: leg.vaultId,
          chainId: group.chainId,
          batcher: leg.batcher,
          batchId,
        });
      }
    }
    if (unconfirmed.length > 0) {
      throw new VaultJoinUnconfirmedError(
        `Transaction ${last.txHash} was mined, but its receipt has no Joined event for ${account} from the batcher of ${unconfirmed.map((id) => `"${id}"`).join(", ")} in group "${group.id}"`,
        { txHash: last.txHash, receipt: last.receipt, unconfirmedVaultIds: unconfirmed },
      );
    }
    return { batches, txHashes };
  }

  /**
   * The batcher a join reaches now: the first retired one whose `currentBatchId` is still at most
   * its `lastBatchId`, else the latest. Read on every join, never cached: the switch happens when
   * the last configured batch is dispatched.
   */
  async #activeBatcher(
    group: VaultGroup,
    vault: VaultGroupVault,
    direction: JoinDirection,
  ): Promise<Address> {
    const history: BatcherHistory = vault.batchers[direction];
    const current = await Promise.all(
      history.retired.map((entry) =>
        this.#read(group.chainId, currentBatchIdContract(entry.address)),
      ),
    );
    return (
      history.retired.find((entry, index) => at(current, index) <= entry.lastBatchId)?.address ??
      history.latest
    );
  }

  #router(group: VaultGroup): Address {
    const router = this.#sdk.chains.find((chain) => chain.id === group.chainId)?.vaultRouterAddress;
    if (router === undefined) {
      throw new ConfigurationError(
        `Vault group "${group.id}" has ${group.vaults.length} vaults, but chain ${group.chainId} has no router; set vaultRouterAddress on the chain`,
      );
    }
    return getAddress(router);
  }

  // The batcher's `fromToken()`: the confidential token a join into it spends. That is the confidential
  // asset for a deposit batcher and the vault's confidential share for a redeem batcher. Fixed at
  // deployment, so read once.
  #fromToken(chainId: number, batcher: Address): Promise<Address> {
    return this.#memo(`fromToken:${chainId}:${batcher}`, async () =>
      getAddress(await this.#read(chainId, fromTokenContract(batcher))),
    );
  }

  // One paused batcher reverts the whole join, so every leg's batcher is read. Never skipped.
  async #assertNotPaused(group: VaultGroup, batchers: readonly Address[]): Promise<void> {
    const paused = await Promise.all(
      batchers.map((batcher) => this.#read(group.chainId, pausedContract(batcher))),
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

  // A short balance joins every batch with nothing and still costs the transaction.
  async #assertBalance(
    direction: JoinDirection,
    legs: readonly VaultLeg[],
    target: VaultLeg,
    account: Address,
  ): Promise<void> {
    // Only the signer can decrypt, and only its own balance. Failing here keeps an unchecked join a
    // decision the caller wrote down, never a check that quietly did not run.
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

  // The signer's account, once its wallet is on the batcher's chain: a write must not land elsewhere.
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
 * A {@link VaultClient} bound to `sdk`. Reads nothing until first used, and
 * holds no state beyond a cache of each batcher's exchange-rate decimals, so
 * creating one is cheap.
 *
 * @example
 * ```ts
 * const vaults = createVaultClient(sdk);
 * const prepared = await vaults.prepareDeposit(STABLE, { vaultId: "beta", account, amount });
 * await yourEngine.send(prepared.calls);
 * ```
 */
export function createVaultClient(sdk: ZamaSDK): VaultClient {
  return new VaultClient(sdk);
}
