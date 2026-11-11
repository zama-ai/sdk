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
  batcherAddresses,
  type BatcherHistory,
  type VaultGroup,
  type VaultGroupVault,
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
  joinContract,
  pausedContract,
  quitContract,
  routerJoinContract,
  toTokenContract,
  tokenWrapperRegistryContract,
  unwrapRequestIdContract,
  vaultContract,
} from "./contracts";
import { takeJoinedBatchId } from "./joined";
import type {
  ActiveBatchers,
  Batch,
  BatchAction,
  BatchRef,
  BatchState,
  BatcherRef,
  Call,
  Direction,
  GrantCall,
  JoinCall,
  JoinInput,
  JoinOptions,
  JoinOutcome,
  JoinRoute,
  OpenBatch,
  PreparedFinalize,
  PreparedJoin,
  SendJoinInput,
  SendJoinOptions,
  VaultCall,
  VaultLeg,
} from "./types";

/** A router pulls a share token only for a join its holder sends, so a year-long grant exposes nothing and saves a prompt on later redeems. */
const GRANT_VALIDITY_SECONDS = 365n * 24n * 60n * 60n;

// The contract's uint8 enum, by index.
const BATCH_STATES: readonly BatchState[] = ["pending", "dispatched", "finalized", "canceled"];

const ENCRYPT_OPERATION = {
  deposit: "vault-deposit",
  redeem: "vault-redeem",
} as const satisfies Record<Direction, TelemetryOperation>;

const JOIN_OPERATION = { legs: "vault:join", router: "vault:routerJoin" } as const satisfies Record<
  JoinRoute,
  TransactionOperation
>;

// Arrays built in leg order line up with the legs, so a gap is an SDK bug, not a user error.
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  assertNonNullable(value, `vault leg ${index}`);
  return value;
}

function duplicate<T>(values: readonly T[]): T | undefined {
  return values.find((value, index) => values.indexOf(value) !== index);
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
 * method takes the {@link VaultGroup} or the batch it acts on, so one client
 * serves every chain and group.
 *
 * `prepare*` methods return plain calls for a host that sends through its own
 * pipeline. The methods named by the bare verb send through the SDK's signer.
 *
 * Every join sends a leg to every vault of its group, the chosen one with the
 * amount and the rest with an encrypted zero, so the chain cannot tell which
 * vault was chosen. Batch actions act on one batch: to keep the choice private
 * when quitting, quit every leg of the join, not only the chosen one.
 */
export class VaultClient {
  /** The SDK the client reads, encrypts and sends through. */
  readonly sdk: ZamaSDK;

  readonly #reads = new Map<string, Promise<unknown>>();
  // Per group object, not per id: two groups with one id can name different batchers.
  readonly #verified = new WeakMap<VaultGroup, Promise<void>>();

  constructor(sdk: ZamaSDK) {
    this.sdk = sdk;
  }

  /** The batcher a join in `direction` reaches right now on each vault of the group. */
  async activeBatchers(group: VaultGroup, direction: Direction): Promise<ActiveBatchers> {
    const entries = await Promise.all(
      group.vaults.map(
        async (vault) => [vault.id, await this.#activeBatcher(group, vault, direction)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  /**
   * Build a deposit of the group's asset into one vault: a leg for every
   * vault, encrypted, with the calls in send order. A deposit pushes the
   * asset, so it needs no grant unless it credits a beneficiary.
   *
   * @throws if the vault is unknown, `beneficiary` is given in a group of more than one, the group does not match the chain, or the provider is on another chain. {@link ConfigurationError}
   * @throws if any vault's batcher is paused. {@link VaultBatcherPausedError}
   * @throws if a router deposit's asset is not listed in the router's registry. {@link UnlistedConfidentialTokenError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   */
  async prepareDeposit<TGroup extends VaultGroup>(
    group: TGroup,
    input: JoinInput<VaultIdOf<TGroup>>,
    options?: JoinOptions,
  ): Promise<PreparedJoin> {
    return (await this.#planJoin("deposit", group, input, options)).prepared;
  }

  /**
   * Build a redemption of one vault's shares. On the router route the router
   * pulls every leg's share token, so `calls` starts with a grant on each
   * share token the account has not granted, valid for a year.
   *
   * @throws as {@link prepareDeposit}.
   */
  async prepareRedeem<TGroup extends VaultGroup>(
    group: TGroup,
    input: JoinInput<VaultIdOf<TGroup>>,
    options?: JoinOptions,
  ): Promise<PreparedJoin> {
    return (await this.#planJoin("redeem", group, input, options)).prepared;
  }

  /** Claim a finalized batch's output for `account`. Anyone may send it; the output always goes to `account`. */
  prepareClaim(batch: BatchRef & { readonly account: Address }): Call {
    return toCall(
      claimContract(getAddress(batch.batcher), batch.batchId, getAddress(batch.account)),
    );
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
   * @throws if the provider is not on the batch's chain. {@link ConfigurationError}
   */
  async prepareFinalize(batch: BatchRef): Promise<PreparedFinalize> {
    return (await this.#planFinalize(batch)).call;
  }

  async #planFinalize(batch: BatchRef): Promise<Planned<PreparedFinalize>> {
    const batcher = getAddress(batch.batcher);
    const [state, requestId, wrapper] = await Promise.all([
      this.#batchState(batch.chainId, batcher, batch.batchId),
      this.#read(batch.chainId, unwrapRequestIdContract(batcher, batch.batchId)),
      this.#read(batch.chainId, fromTokenContract(batcher)),
    ]);
    // Outside `dispatched` the request is unset or spent, so the decryption would fail opaquely.
    if (state !== "dispatched") {
      throw new VaultBatchNotDispatchedError(
        `Batch ${batch.batchId} of batcher ${batcher} is ${state}, but only a dispatched batch can be finalized`,
        { batcher, batchId: batch.batchId, state },
      );
    }
    const handle = await this.#read(
      batch.chainId,
      unwrapAmountContract(getAddress(wrapper), requestId),
    );
    await this.#requireProviderChain(batch.chainId, "vault finalize");
    const { clearValues, decryptionProof } = await this.sdk.decryption.decryptPublicValues(
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
  async deposit<TGroup extends VaultGroup>(
    group: TGroup,
    input: SendJoinInput<VaultIdOf<TGroup>>,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome> {
    return this.#join("deposit", group, input, options);
  }

  /**
   * Redeem with the SDK's signer. In a group of more than one vault, a
   * redemption first asks the wallet for each router grant the account lacks.
   *
   * @throws as {@link deposit}.
   */
  async redeem<TGroup extends VaultGroup>(
    group: TGroup,
    input: SendJoinInput<VaultIdOf<TGroup>>,
    options?: SendJoinOptions,
  ): Promise<JoinOutcome> {
    return this.#join("redeem", group, input, options);
  }

  /** Claim a finalized batch with the SDK's signer, for `account` (default: the signer). */
  async claim(batch: BatchRef & { readonly account?: Address }): Promise<TransactionResult> {
    const signer = await this.#writeAccount(batch.chainId, "claim");
    const call = claimContract(
      getAddress(batch.batcher),
      batch.batchId,
      getAddress(batch.account ?? signer),
    );
    return this.#send(call, "vault:claim");
  }

  /** Quit a pending or canceled batch with the SDK's signer, which must be the depositor. */
  async quit(batch: BatchRef): Promise<TransactionResult> {
    await this.#writeAccount(batch.chainId, "quit");
    return this.#send(quitContract(getAddress(batch.batcher), batch.batchId), "vault:quit");
  }

  /** Dispatch the batcher's open batch with the SDK's signer. A keeper normally does. */
  async dispatch(batch: BatcherRef): Promise<TransactionResult> {
    await this.#writeAccount(batch.chainId, "dispatch");
    return this.#send(dispatchBatchContract(getAddress(batch.batcher)), "vault:dispatchBatch");
  }

  /** Finalize a dispatched batch with the SDK's signer. A keeper normally does. */
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
  async readBatch(batch: BatchRef & { readonly account?: Address }): Promise<Batch> {
    const { chainId, batchId } = batch;
    const batcher = getAddress(batch.batcher);
    const account = batch.account === undefined ? undefined : getAddress(batch.account);
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
        account === undefined
          ? null
          : this.#read(chainId, depositsContract(batcher, batchId, account)),
        this.sdk.provider.getBlockTimestamp(chainId),
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
  async readOpenBatches(group: VaultGroup, direction: Direction): Promise<readonly OpenBatch[]> {
    const { chainId } = group;
    const [now, batches] = await Promise.all([
      this.sdk.provider.getBlockTimestamp(chainId),
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
    direction: Direction,
    group: VaultGroup,
    input: JoinInput,
    options: JoinOptions | undefined,
  ): Promise<{ readonly prepared: PreparedJoin; readonly planned: readonly Planned<VaultCall>[] }> {
    const chosen = group.vaults.find((vault) => vault.id === input.vaultId);
    if (chosen === undefined) {
      throw new ConfigurationError(`Vault group "${group.id}" has no vault "${input.vaultId}"`);
    }
    const skip = new Set(options?.skipChecks);
    const account = getAddress(input.account);
    const beneficiary = input.beneficiary === undefined ? account : getAddress(input.beneficiary);
    const single = group.vaults.length === 1;
    if (beneficiary !== account && !single) {
      throw new ConfigurationError(
        `Vault group "${group.id}" has ${group.vaults.length} vaults, and only a group of one can credit a beneficiary`,
      );
    }
    const route: JoinRoute = single || options?.walletMode === "bundle" ? "legs" : "router";
    const router = route === "router" ? this.#router(group) : undefined;

    // Encryption runs on the provider's chain, so check it before anything prompts.
    await this.#requireProviderChain(group.chainId, `vault ${direction}`);
    const [batchers] = await Promise.all([
      Promise.all(group.vaults.map((vault) => this.#activeBatcher(group, vault, direction))),
      skip.has("config") ? undefined : this.#verifyGroup(group),
      router !== undefined && direction === "deposit" && !skip.has("config")
        ? this.#assertAssetListed(group, router)
        : undefined,
    ]);
    await this.#assertNotPaused(group, batchers);
    const legs = nonEmpty(
      group.vaults.map((vault, index): VaultLeg => ({
        vaultId: vault.id,
        batcher: at(batchers, index),
        token: direction === "deposit" ? group.asset : vault.share,
        amount: vault === chosen ? input.amount : 0n,
      })),
    );
    const target = at(legs, group.vaults.indexOf(chosen));
    if (!skip.has("balance")) {
      await this.#assertBalance(direction, legs, target, account);
    }

    const operation = ENCRYPT_OPERATION[direction];
    const join = (config: WriteContractConfig, leg: VaultLeg): Planned<JoinCall> => ({
      config,
      call: { ...toCall(config), role: "join", leg },
    });
    let joins: Planned<JoinCall>[];
    let grants: Planned<GrantCall>[] = [];
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
          this.#missingGrants(group.chainId, legs, account, router),
        ]);
        grants = missing;
        joins = [join(routerJoinContract(router, allocationOf(handles), routerProof), target)];
      } else {
        // One proof per verifying contract: the router checks the allocation, the asset the
        // transfer of the total, which must equal the allocation's sum.
        const [[handles, routerProof], [[total], assetProof]] = await Promise.all([
          this.#encrypt(router, account, amounts, operation),
          this.#encrypt(group.asset, account, [input.amount], operation),
        ]);
        const data = encodeAllocationData(allocationOf(handles), routerProof);
        joins = [
          join(
            confidentialTransferAndCallContract(group.asset, router, total, assetProof, data),
            target,
          ),
        ];
      }
    } else if (beneficiary !== account) {
      // The batcher pulls the amount from the sender, so the proof is bound to the batcher.
      const [[handle], inputProof] = await this.#encrypt(
        target.batcher,
        account,
        [input.amount],
        operation,
      );
      grants = await this.#missingGrants(group.chainId, [target], account, target.batcher);
      joins = [join(joinContract(target.batcher, beneficiary, handle, inputProof), target)];
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

    // Grants first: the router or batcher pulls under them.
    const planned: Planned<VaultCall>[] = [...grants, ...joins];
    return {
      prepared: {
        kind: direction,
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
    direction: Direction,
    group: VaultGroup,
    input: SendJoinInput,
    options: SendJoinOptions | undefined,
  ): Promise<JoinOutcome> {
    const signer = this.#signer(direction);
    const account = await this.#writeAccount(group.chainId, direction);
    const { prepared, planned } = await this.#planJoin(
      direction,
      group,
      { ...input, account },
      { skipChecks: options?.skipChecks },
    );
    // The SDK sends one call at a time and never bundles, so the calls are any grants, then a single join.
    const txHashes: Hex[] = [];
    let last: TransactionResult | undefined;
    for (const [index, { call, config }] of planned.entries()) {
      last = await submitTransaction({
        operation: call.role === "grant" ? "setOperator" : JOIN_OPERATION[prepared.route],
        signer,
        provider: this.sdk.provider,
        config,
        onSubmitted: index === planned.length - 1 ? options?.onJoinSubmitted : undefined,
        emit: (event) => this.sdk.emitEvent(event, call.to),
        logger: this.sdk.logger,
      });
      txHashes.push(last.txHash);
    }
    assertNonNullable(last, `vault ${direction}: last transaction`);
    const credited = getAddress(input.beneficiary ?? account);
    const logs = [...last.receipt.logs];
    const batches: (BatchRef & { vaultId: string })[] = [];
    const unconfirmed: string[] = [];
    for (const leg of prepared.legs) {
      const batchId = takeJoinedBatchId(logs, leg.batcher, credited);
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
        `Transaction ${last.txHash} was mined, but its receipt has no Joined event for ${credited} from the batcher of ${unconfirmed.map((id) => `"${id}"`).join(", ")} in group "${group.id}"`,
        { txHash: last.txHash, receipt: last.receipt, unconfirmedVaultIds: unconfirmed },
      );
    }
    return { prepared, batches, txHashes };
  }

  /**
   * The batcher a join reaches now: the first retired one whose `currentBatchId` is still at most
   * its `lastBatchId`, else the latest. Read on every join, never cached: the switch happens when
   * the last configured batch is dispatched.
   */
  async #activeBatcher(
    group: VaultGroup,
    vault: VaultGroupVault,
    direction: Direction,
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
    const canonical = this.sdk.chains.find(
      (chain) => chain.id === group.chainId,
    )?.vaultRouterAddress;
    const router = group.router ?? (canonical === undefined ? undefined : getAddress(canonical));
    if (router === undefined) {
      throw new ConfigurationError(
        `Vault group "${group.id}" has ${group.vaults.length} vaults and no router; set router, or use a chain preset that has one`,
      );
    }
    if (canonical !== undefined && router !== getAddress(canonical)) {
      throw new ConfigurationError(
        `Vault group "${group.id}" names router ${router}, but the router on chain ${group.chainId} is ${getAddress(canonical)}`,
      );
    }
    return router;
  }

  // Once per group: every batcher of a vault, retired ones included, trades the group's asset for
  // the vault's share token against one ERC-4626 vault, and no two vaults share that vault.
  async #verifyGroup(group: VaultGroup): Promise<void> {
    let pending = this.#verified.get(group);
    if (pending === undefined) {
      pending = this.#checkGroup(group).catch((error: unknown) => {
        this.#verified.delete(group);
        throw error;
      });
      this.#verified.set(group, pending);
    }
    await pending;
  }

  async #checkGroup(group: VaultGroup): Promise<void> {
    await (async () => {
      const report = async (batcher: Address) =>
        (
          await Promise.all([
            this.#read(group.chainId, fromTokenContract(batcher)),
            this.#read(group.chainId, toTokenContract(batcher)),
            this.#read(group.chainId, vaultContract(batcher)),
          ])
        ).map((address) => getAddress(address));
      const vaults = await Promise.all(
        group.vaults.map(async (vault) => {
          const where = `Vault "${vault.id}" of group "${group.id}"`;
          const [deposits, redeems] = await Promise.all([
            Promise.all(batcherAddresses(vault.batchers.deposit).map(report)),
            Promise.all(batcherAddresses(vault.batchers.redeem).map(report)),
          ]);
          // Deposit batchers take the asset and pay the share; redeem batchers the reverse.
          const sides = [
            ...deposits.map(([taken, paid, erc4626]) => ({ asset: taken, share: paid, erc4626 })),
            ...redeems.map(([taken, paid, erc4626]) => ({ asset: paid, share: taken, erc4626 })),
          ];
          const first = at(sides, 0);
          for (const side of sides) {
            if (side.asset !== group.asset || side.share !== vault.share) {
              throw new ConfigurationError(
                `${where} has a batcher trading ${side.asset} for ${side.share}, not the configured asset ${group.asset} and share ${vault.share}`,
              );
            }
            if (side.erc4626 !== first.erc4626) {
              throw new ConfigurationError(
                `${where} has batchers pointing at different ERC-4626 vaults`,
              );
            }
          }
          return first.erc4626;
        }),
      );
      const twice = duplicate(vaults);
      if (twice !== undefined) {
        throw new ConfigurationError(
          `Vault group "${group.id}" has two vaults whose batchers report the same vault ${twice}`,
        );
      }
    })();
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

  // The router rejects a push of an unlisted token with a revert that costs a transaction. Not cached: a listing can be revoked.
  async #assertAssetListed(group: VaultGroup, router: Address): Promise<void> {
    const registry = await this.#memo(`registry:${group.chainId}:${router}`, async () =>
      getAddress(await this.#read(group.chainId, tokenWrapperRegistryContract(router))),
    );
    if (
      !(await this.#read(group.chainId, isConfidentialTokenValidContract(registry, group.asset)))
    ) {
      throw new UnlistedConfidentialTokenError(
        `The vault router's registry does not list ${group.asset}, so it would reject a transfer of it`,
        { token: group.asset, registry },
      );
    }
  }

  // A short balance joins every batch with nothing and still costs the transaction.
  async #assertBalance(
    direction: Direction,
    legs: readonly VaultLeg[],
    target: VaultLeg,
    account: Address,
  ): Promise<void> {
    await assertConfidentialBalance({
      operation: direction,
      tokenAddress: target.token,
      amount: target.amount,
      account,
      signer: this.sdk.signer,
      provider: this.sdk.provider,
      // Every leg's token is decrypted, not only the chosen one's: a lone decrypt would tell the relayer which vault was picked.
      readBalance: async (owner) => {
        const tokens = [...new Set(legs.map((leg) => leg.token))].map(
          (address) => new Token(this.sdk, address),
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

  async #missingGrants(
    chainId: number,
    legs: readonly VaultLeg[],
    account: Address,
    operator: Address,
  ): Promise<Planned<GrantCall>[]> {
    const granted = await Promise.all(
      legs.map((leg) => this.#read(chainId, isOperatorContract(leg.token, account, operator))),
    );
    const missing = legs.filter((_leg, index) => !granted[index]);
    if (missing.length === 0) {
      return [];
    }
    // The token compares the deadline against the block's time, not the local clock.
    const until = (await this.sdk.provider.getBlockTimestamp(chainId)) + GRANT_VALIDITY_SECONDS;
    return missing.map((leg) => {
      const config = setOperatorContract(leg.token, operator, Number(until));
      return {
        config,
        call: {
          ...toCall(config),
          role: "grant",
          vaultId: leg.vaultId,
          token: leg.token,
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
    if (this.sdk.signer === undefined) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.sdk.signer;
  }

  // The signer's account, once its wallet is on the batcher's chain: a write must not land elsewhere.
  async #writeAccount(chainId: number, operation: string): Promise<Address> {
    const account = await requireWriteChain(
      `vault ${operation}`,
      this.#signer(operation),
      this.sdk.provider,
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
      provider: this.sdk.provider,
      config,
      emit: (event) => this.sdk.emitEvent(event, config.address),
      logger: this.sdk.logger,
    });
  }

  async #requireProviderChain(chainId: number, operation: string): Promise<void> {
    const providerChainId = await this.sdk.provider.getChainId();
    if (providerChainId !== chainId) {
      throw new ConfigurationError(
        `Operation "${operation}" encrypts or decrypts on chain ${chainId}, but the provider is on chain ${providerChainId}; switch to chain ${chainId} first`,
      );
    }
  }

  #memo<T>(key: string, read: () => Promise<T>): Promise<T> {
    return memoize(this.#reads as Map<string, Promise<T>>, key, read);
  }

  #read<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(chainId: number, config: ReadContractConfig<TAbi, TFunctionName, TArgs>) {
    return this.sdk.provider.readContract({ ...config, chainId });
  }
}

/**
 * A {@link VaultClient} bound to `sdk`. Reads nothing until first used; a
 * group is checked against the chain once, on its first join.
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
