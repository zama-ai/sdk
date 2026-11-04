import { getAddress, type Address, type Hex } from "viem";
import { unwrapAmountContract } from "../contracts";
import {
  DecryptionFailedError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  VaultBatchNotDispatchedError,
} from "../errors";
import type { TransactionOperation } from "../events/sdk-events";
import type { EncryptedValue } from "../relayer/types";
import { type TelemetryOperation, withOperation } from "../telemetry";
import { Token } from "../token";
import type { GenericSigner, TransactionResult, WriteContractConfig } from "../types";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { assertBigint } from "../utils/assertions";
import { isEncryptedValueZero } from "../utils/handles";
import { memoizeAddressRead } from "../utils/memoize-address-read";
import { submitTransaction as submitSdkTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import {
  batchCallbackDeadlineContract,
  batchCreatedAtContract,
  batchDispatchedAtContract,
  batchMinBatchAgeContract,
  batchStateContract,
  callbackDeadlineContract,
  claimContract,
  currentBatchIdContract,
  depositsContract,
  dispatchBatchCallbackContract,
  dispatchBatchContract,
  exchangeRateContract,
  exchangeRateDecimalsContract,
  fromTokenContract,
  joinContract,
  minBatchAgeContract,
  pausedContract,
  quitContract,
  recoverContract,
  toTokenContract,
  totalDepositsContract,
  unwrapRequestIdContract,
  vaultContract,
} from "./contracts";
import { findJoined } from "./events";
import { BatchState, type JoinOptions, type JoinResult } from "./types";

/** A settlement built but not sent: what {@link VaultBatcher.prepareFinalize} returns. */
export interface PreparedFinalize {
  /** The batch the call settles. */
  readonly batchId: bigint;
  /** The publicly decrypted amount the batch's unwrap released. */
  readonly unwrapAmountCleartext: bigint;
  /** The relayer's proof of that decryption, which the batcher verifies. */
  readonly decryptionProof: Hex;
  /** The `dispatchBatchCallback` call, ready for the host's own signer. */
  readonly call: WriteContractConfig;
}

/**
 * One on-chain batcher contract: it pools participants' encrypted amounts,
 * dispatches only the decrypted aggregate through the underlying ERC-4626
 * vault, and lets each participant claim their share. A vault has one batcher
 * per direction, so construct one instance for deposits and one for redeems.
 *
 * The lifecycle is `join` → `dispatchBatch` → `claim`. Finalization between
 * the last two is normally driven by the relayer, so a batch is claimable only
 * once it reaches {@link BatchState.Finalized}, which can be well after
 * dispatch; {@link finalize} settles a batch the relayer has not.
 */
export class VaultBatcher {
  /** The SDK instance this batcher reads and writes through. */
  readonly sdk: ZamaSDK;
  /** Checksummed address of the batcher contract. */
  readonly address: Address;

  readonly #vault: () => Promise<Address>;
  readonly #fromToken: () => Promise<Address>;
  readonly #toToken: () => Promise<Address>;

  // One instance, so repeated joins reuse the token's decrypted-balance cache.
  #fromTokenInstance: Promise<Token> | null = null;

  constructor(sdk: ZamaSDK, address: Address) {
    this.sdk = sdk;
    this.address = getAddress(address);
    this.#vault = memoizeAddressRead(() => sdk.provider.readContract(vaultContract(this.address)));
    this.#fromToken = memoizeAddressRead(() =>
      sdk.provider.readContract(fromTokenContract(this.address)),
    );
    this.#toToken = memoizeAddressRead(() =>
      sdk.provider.readContract(toTokenContract(this.address)),
    );
  }

  // READS

  /**
   * The underlying ERC-4626 vault. Share price (`convertToShares`,
   * `convertToAssets`, `totalAssets`) is read from it directly, not from the
   * batcher. Resolved once and cached.
   */
  async vault(): Promise<Address> {
    return this.#vault();
  }

  /**
   * The confidential token this batcher accepts as input (e.g. shares for a
   * redeem batcher). Resolved once and cached.
   */
  async fromToken(): Promise<Address> {
    return this.#fromToken();
  }

  /**
   * The confidential token this batcher pays out (e.g. shares for a
   * deposit batcher). Resolved once and cached.
   */
  async toToken(): Promise<Address> {
    return this.#toToken();
  }

  /** The id of the currently open (not-yet-dispatched) batch. */
  async currentBatchId(): Promise<bigint> {
    return this.sdk.provider.readContract(currentBatchIdContract(this.address));
  }

  /**
   * A batch's lifecycle state. See {@link BatchState} for which operation each
   * state allows.
   *
   * @throws Reverts on chain with `BatchNonexistent` for an id above
   *   {@link currentBatchId} — batch ids start at 1.
   */
  async batchState(batchId: bigint): Promise<BatchState> {
    // The ABI types this uint8 enum as a plain `number`.
    const state = await this.sdk.provider.readContract(batchStateContract(this.address, batchId));
    return state as BatchState;
  }

  /** Whether the batcher is paused. While paused, `join` and `dispatchBatch` revert; `quit` and `claim` still work. */
  async paused(): Promise<boolean> {
    return this.sdk.provider.readContract(pausedContract(this.address));
  }

  /**
   * The policy for batches opened from now on. Dispatch of an existing batch
   * is gated on {@link batchMinBatchAge} instead.
   */
  async minBatchAge(): Promise<bigint> {
    return this.sdk.provider.readContract(minBatchAgeContract(this.address));
  }

  /** The minimum age in seconds pinned to `batchId` when it opened — the value dispatch enforces. */
  async batchMinBatchAge(batchId: bigint): Promise<bigint> {
    return this.sdk.provider.readContract(batchMinBatchAgeContract(this.address, batchId));
  }

  /**
   * How long a dispatched batch may wait for its decryption callback before it
   * is canceled — seconds, not a timestamp, despite the name. Applies to
   * batches opened from now on; for an existing batch use
   * {@link batchCallbackDeadline}.
   */
  async callbackDeadline(): Promise<bigint> {
    return this.sdk.provider.readContract(callbackDeadlineContract(this.address));
  }

  /**
   * The callback deadline pinned to `batchId` when it opened. Add it to
   * {@link batchDispatchedAt} for the timestamp that batch must finalize by.
   */
  async batchCallbackDeadline(batchId: bigint): Promise<bigint> {
    return this.sdk.provider.readContract(batchCallbackDeadlineContract(this.address, batchId));
  }

  /** The Unix timestamp (seconds) at which a batch was opened. */
  async batchCreatedAt(batchId: bigint): Promise<bigint> {
    return this.sdk.provider.readContract(batchCreatedAtContract(this.address, batchId));
  }

  /** The Unix timestamp (seconds) at which a batch was dispatched, or `0` if it hasn't been yet. */
  async batchDispatchedAt(batchId: bigint): Promise<bigint> {
    return this.sdk.provider.readContract(batchDispatchedAtContract(this.address, batchId));
  }

  /**
   * A finalized batch's exchange rate, scaled by
   * {@link exchangeRateDecimals}; `0` until the batch finalizes. A claim pays
   * out `deposit * exchangeRate / 10 ** exchangeRateDecimals`, rounded down.
   */
  async exchangeRate(batchId: bigint): Promise<bigint> {
    return this.sdk.provider.readContract(exchangeRateContract(this.address, batchId));
  }

  /** The number of decimals {@link exchangeRate} is scaled by. */
  async exchangeRateDecimals(): Promise<number> {
    return this.sdk.provider.readContract(exchangeRateDecimalsContract(this.address));
  }

  /**
   * Seconds until `batchId` becomes eligible for dispatch, `0` once it already
   * is — the earliest possible moment, not a promise anyone will dispatch
   * then. `null` once the batch has left {@link BatchState.Pending} and can
   * never be dispatched again.
   *
   * Measured against the chain's block timestamp and the batch's own pinned
   * minimum age, so neither local clock drift nor a mid-flight policy change
   * desyncs the countdown.
   */
  async timeUntilDispatchable(batchId: bigint): Promise<bigint | null> {
    const [state, createdAt, minAge, now] = await Promise.all([
      this.batchState(batchId),
      this.batchCreatedAt(batchId),
      this.batchMinBatchAge(batchId),
      this.sdk.provider.getBlockTimestamp(),
    ]);
    if (state !== BatchState.Pending) {
      return null;
    }
    const eligibleAt = createdAt + minAge;
    return eligibleAt > now ? eligibleAt - now : 0n;
  }

  /**
   * Seconds until a dispatched batch reaches its callback deadline, `0` once
   * it has. From then on {@link finalize} cancels the batch instead of
   * settling it. `null` outside {@link BatchState.Dispatched}, where there is
   * nothing to finalize.
   *
   * Measured against the chain's block timestamp and the batch's own pinned
   * deadline, like {@link timeUntilDispatchable}.
   */
  async timeUntilCallbackDeadline(batchId: bigint): Promise<bigint | null> {
    const [state, dispatchedAt, deadline, now] = await Promise.all([
      this.batchState(batchId),
      this.batchDispatchedAt(batchId),
      this.batchCallbackDeadline(batchId),
      this.sdk.provider.getBlockTimestamp(),
    ]);
    if (state !== BatchState.Dispatched) {
      return null;
    }
    const cancelsAt = dispatchedAt + deadline;
    return cancelsAt > now ? cancelsAt - now : 0n;
  }

  /** The encrypted aggregate amount joined into a batch, without decrypting it. */
  async confidentialTotalDeposits(batchId: bigint): Promise<EncryptedValue> {
    return this.sdk.provider.readContract(totalDepositsContract(this.address, batchId));
  }

  /** The encrypted amount `account` joined into a batch, without decrypting it. */
  async confidentialDepositOf(batchId: bigint, account: Address): Promise<EncryptedValue> {
    return this.sdk.provider.readContract(
      depositsContract(this.address, batchId, getAddress(account)),
    );
  }

  /**
   * The unwrap request on `fromToken` that a dispatched batch settles against
   * once its amount is publicly decrypted. Zero until the batch is dispatched.
   */
  async unwrapRequestId(batchId: bigint): Promise<EncryptedValue> {
    return this.sdk.provider.readContract(unwrapRequestIdContract(this.address, batchId));
  }

  /**
   * Decrypt and return the plaintext amount `account` joined into a batch.
   * Acquires FHE credentials via a wallet signature if none are cached.
   */
  async depositOf(batchId: bigint, account: Address): Promise<bigint> {
    const normalizedAccount = getAddress(account);
    const encryptedValue = await this.confidentialDepositOf(batchId, normalizedAccount);
    if (isEncryptedValueZero(encryptedValue)) {
      return 0n;
    }
    const result = await this.sdk.decryption.decryptValues(
      [{ encryptedValue, contractAddress: this.address }],
      { operation: "vault-deposit-of" },
    );
    const value = result[encryptedValue];
    if (value === undefined) {
      throw new DecryptionFailedError(`Decryption returned no value for ${encryptedValue}`);
    }
    assertBigint(value, "depositOf: result[encryptedValue]");
    return value;
  }

  // WRITES

  /**
   * Join the currently open batch with a plaintext amount, encrypted via FHE
   * automatically. Once someone calls {@link dispatchBatch} and the relayer
   * finalizes it, call {@link claim} to receive the output.
   *
   * @param amount - The plaintext amount to contribute; encrypted before submission.
   * @param beneficiary - Recipient of the batch's eventual output. Defaults to the connected wallet account.
   *
   * @remarks
   * The batcher must already hold an ERC-7984 operator grant from the caller,
   * or it cannot pull the amount. A join with too little balance still
   * succeeds on chain and credits nothing, so the amount is checked against
   * the caller's confidential balance first; `confidentialJoinedAmount` is the
   * authoritative record of what actually landed.
   *
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   */
  async join(amount: bigint, beneficiary?: Address, options?: JoinOptions): Promise<JoinResult> {
    const { operation } = withOperation(options, "vault-join");
    this.#requireSigner("join");
    const account = await requireAlignedWalletAccount("join", this.sdk.signer, this.sdk.provider);
    const userAddress = getAddress(account.address);
    const resolvedBeneficiary = beneficiary ? getAddress(beneficiary) : userAddress;

    if (!options?.skipBalanceCheck) {
      await this.#assertJoinableBalance(amount, operation);
    }

    const { encryptedValues, inputProof } = await this.sdk.encrypt(
      { values: [{ value: amount, type: "euint64" }], contractAddress: this.address, userAddress },
      { operation },
    );

    const encryptedAmount = encryptedValues[0];
    if (!encryptedAmount) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    const result = await this.#submitTransaction(
      "vault:join",
      joinContract(this.address, resolvedBeneficiary, encryptedAmount, inputProof),
    );

    const joined = findJoined(result.receipt.logs, this.address, resolvedBeneficiary);
    if (!joined) {
      throw new TransactionRevertedError(
        `No Joined event for ${resolvedBeneficiary} from batcher ${this.address} found in the join receipt`,
      );
    }
    return {
      ...result,
      batchId: joined.batchId,
      beneficiary: joined.account,
      confidentialJoinedAmount: joined.confidentialAmount,
    };
  }

  /**
   * Withdraw the caller's own deposit from a batch, returning it to their
   * confidential balance on `fromToken`.
   *
   * Legal in two states: {@link BatchState.Pending} (undo a join before
   * dispatch) and {@link BatchState.Canceled} (take the deposit back after a
   * batch failed to finalize).
   *
   * Refunds the caller only. To refund someone else's deposit in a canceled
   * batch, use {@link recover}.
   */
  async quit(batchId: bigint): Promise<TransactionResult> {
    this.#requireSigner("quit");
    await requireChainAlignment("quit", this.sdk.signer, this.sdk.provider);
    return this.#submitTransaction("vault:quit", quitContract(this.address, batchId));
  }

  /**
   * Refund `account`'s deposit in a canceled batch on their behalf.
   * Permissionless — anyone can call this, and the refund always goes to
   * `account`, never to the caller.
   *
   * Only legal once the batch reaches {@link BatchState.Canceled}; before that,
   * a participant undoes their own join with {@link quit}.
   *
   * @param account - The depositor to refund. Defaults to the connected wallet account.
   */
  async recover(batchId: bigint, account?: Address): Promise<TransactionResult> {
    const target = await this.#resolveTarget("recover", account);
    return this.#submitTransaction("vault:recover", recoverContract(this.address, batchId, target));
  }

  /**
   * Claim a finalized batch's output for `account`. Permissionless — anyone
   * can call this on another account's behalf, and the output always goes to
   * `account`, never to the caller. The amount is not returned; read it as a
   * balance on the batcher's {@link toToken}.
   *
   * Only legal once the batch reaches {@link BatchState.Finalized}; on a
   * canceled batch use {@link quit} or {@link recover} instead.
   *
   * @param account - The account to claim for. Defaults to the connected wallet account.
   */
  async claim(batchId: bigint, account?: Address): Promise<TransactionResult> {
    const target = await this.#resolveTarget("claim", account);
    return this.#submitTransaction("vault:claim", claimContract(this.address, batchId, target));
  }

  /**
   * Close the current batch once it has reached its pinned minimum age and
   * kick off decryption of its aggregate amount. Permissionless — any
   * account with a configured signer can call this, not just participants.
   * Reverts while the batcher is {@link paused}.
   */
  async dispatchBatch(): Promise<TransactionResult> {
    this.#requireSigner("dispatchBatch");
    await requireChainAlignment("dispatchBatch", this.sdk.signer, this.sdk.provider);
    return this.#submitTransaction("vault:dispatchBatch", dispatchBatchContract(this.address));
  }

  /**
   * Settle a dispatched batch yourself: publicly decrypt the aggregate amount
   * its unwrap request released and hand the cleartext and proof to the
   * batcher, which executes the route. Permissionless, like
   * {@link dispatchBatch}. The relayer normally does this, so reach for it
   * when a batch has sat in {@link BatchState.Dispatched} longer than
   * expected. Past the batch's callback deadline the same call cancels the
   * batch instead of settling it; {@link timeUntilCallbackDeadline} says
   * which one a call now does.
   *
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if the batch is not {@link BatchState.Dispatched}, for example because the relayer already finalized it. {@link VaultBatchNotDispatchedError}
   * @throws if the public decryption returns no cleartext for the amount. {@link DecryptionFailedError}
   */
  async finalize(batchId: bigint): Promise<TransactionResult> {
    this.#requireSigner("finalize");
    await requireChainAlignment("finalize", this.sdk.signer, this.sdk.provider);
    const { call } = await this.prepareFinalize(batchId);
    return this.#submitTransaction("vault:finalize", call);
  }

  /**
   * Build the settlement {@link finalize} sends without sending it: the
   * `dispatchBatchCallback` call with the publicly decrypted amount and its
   * proof, for a host that signs and sends through its own pipeline. Needs no
   * signer.
   *
   * @throws if the batch is not {@link BatchState.Dispatched}, for example because the relayer already finalized it. {@link VaultBatchNotDispatchedError}
   * @throws if the public decryption returns no cleartext for the amount. {@link DecryptionFailedError}
   */
  async prepareFinalize(batchId: bigint): Promise<PreparedFinalize> {
    const [state, unwrapRequestId, wrapper] = await Promise.all([
      this.batchState(batchId),
      this.unwrapRequestId(batchId),
      this.fromToken(),
    ]);
    // Checked before the decryption: outside `Dispatched` the request id is unset or already
    // consumed, so the relayer round trip would end in an opaque error or a reverting call.
    if (state !== BatchState.Dispatched) {
      const name = Object.entries(BatchState).find(([, value]) => value === state)?.[0] ?? state;
      throw new VaultBatchNotDispatchedError(
        `Batch ${batchId} of batcher ${this.address} is ${name}, but only a Dispatched batch can be finalized`,
        { batcher: this.address, batchId, state },
      );
    }
    const encryptedAmount = await this.sdk.provider.readContract(
      unwrapAmountContract(wrapper, unwrapRequestId),
    );
    const { clearValues, decryptionProof } = await this.sdk.decryption.decryptPublicValues(
      [encryptedAmount],
      { operation: "vault-finalize" },
    );
    const cleartext = clearValues[encryptedAmount];
    if (cleartext === undefined) {
      throw new DecryptionFailedError(`Public decryption returned no value for ${encryptedAmount}`);
    }
    assertBigint(cleartext, "finalize: clearValues[encryptedAmount]");
    return {
      batchId,
      unwrapAmountCleartext: cleartext,
      decryptionProof,
      call: dispatchBatchCallbackContract(this.address, batchId, cleartext, decryptionProof),
    };
  }

  // INTERNAL

  #requireSigner(operation: string): GenericSigner {
    if (!this.sdk.signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.sdk.signer;
  }

  async #inputToken(): Promise<Token> {
    this.#fromTokenInstance ??= this.fromToken()
      .then((address) => new Token(this.sdk, address))
      .catch((error: unknown) => {
        this.#fromTokenInstance = null;
        throw error;
      });
    return this.#fromTokenInstance;
  }

  async #assertJoinableBalance(
    amount: bigint,
    telemetryOperation: TelemetryOperation,
  ): Promise<void> {
    const token = await this.#inputToken();
    return assertConfidentialBalance({
      operation: "join",
      tokenAddress: token.address,
      amount,
      signer: this.sdk.signer,
      provider: this.sdk.provider,
      readBalance: (owner) => token.decryptBalance(owner, telemetryOperation),
    });
  }

  /**
   * Chain alignment is verified even when `account` is someone else's: the
   * connected signer still submits the transaction.
   */
  async #resolveTarget(operation: string, account: Address | undefined): Promise<Address> {
    this.#requireSigner(operation);
    if (account) {
      await requireChainAlignment(operation, this.sdk.signer, this.sdk.provider);
      return getAddress(account);
    }
    const aligned = await requireAlignedWalletAccount(
      operation,
      this.sdk.signer,
      this.sdk.provider,
    );
    return getAddress(aligned.address);
  }

  async #submitTransaction(
    operation: TransactionOperation,
    config: WriteContractConfig,
  ): Promise<TransactionResult> {
    return submitSdkTransaction({
      operation,
      signer: this.#requireSigner(operation),
      provider: this.sdk.provider,
      config,
      emit: (input) => this.sdk.emitEvent(input, this.address),
      logger: this.sdk.logger,
    });
  }
}

/**
 * Create a {@link VaultBatcher} bound to `sdk` for the batcher contract at `address`.
 *
 * @example
 * ```ts
 * import { createVaultBatcher } from "@zama-fhe/sdk/vaults";
 *
 * const depositBatcher = createVaultBatcher(sdk, "0xDepositBatcher");
 * const { batchId } = await depositBatcher.join(1_000_000n);
 * ```
 */
export function createVaultBatcher(sdk: ZamaSDK, address: Address): VaultBatcher {
  return new VaultBatcher(sdk, address);
}
