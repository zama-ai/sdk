import { getAddress, type Address, type Hex } from "viem";
import {
  DecryptionFailedError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import type { EncryptedValue } from "../relayer/types";
import type { GenericSigner, TransactionResult, WriteContractConfig } from "../types";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { isEncryptedValueZero } from "../utils/handles";
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
  dispatchBatchContract,
  exchangeRateContract,
  exchangeRateDecimalsContract,
  fromTokenContract,
  joinContract,
  minBatchAgeContract,
  pausedContract,
  quitContract,
  toTokenContract,
  totalDepositsContract,
  vaultContract,
} from "./contracts";
import { findJoined } from "./events";
import type { BatchState, JoinResult } from "./types";

/**
 * Safe to cache forever: the addresses a batcher reports are set at deploy
 * time and never change.
 */
function memoizeAddressRead(read: () => Promise<Address>): () => Promise<Address> {
  let cached: Address | undefined;
  let pending: Promise<Address> | null = null;
  return () => {
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    if (!pending) {
      pending = read()
        .then((value) => {
          cached = value;
          pending = null;
          return value;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
}

/**
 * One on-chain batcher contract: it pools participants' encrypted amounts,
 * dispatches only the decrypted aggregate through the underlying ERC-4626
 * vault, and lets each participant claim their share. A vault has one batcher
 * per direction, so construct one instance for deposits and one for redeems.
 *
 * The lifecycle is `join` → `dispatchBatch` → `claim`, but finalization
 * between the last two is driven by the relayer, not by the caller: a batch
 * is claimable only once it reaches {@link BatchState.Finalized}, which can be
 * well after dispatch.
 */
export class VaultBatcher {
  /** The SDK instance this batcher reads and writes through. */
  readonly sdk: ZamaSDK;
  /** Checksummed address of the batcher contract. */
  readonly address: Address;

  readonly #vault: () => Promise<Address>;
  readonly #fromToken: () => Promise<Address>;
  readonly #toToken: () => Promise<Address>;

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
    return this.sdk.provider.readContract(batchStateContract(this.address, batchId));
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
   * is — the earliest possible moment, not a promise anyone will dispatch then.
   *
   * Measured against the chain's block timestamp and the batch's own pinned
   * minimum age, so neither local clock drift nor a mid-flight policy change
   * desyncs the countdown.
   */
  async timeUntilDispatchable(batchId: bigint): Promise<bigint> {
    const [createdAt, minAge, now] = await Promise.all([
      this.batchCreatedAt(batchId),
      this.batchMinBatchAge(batchId),
      this.sdk.provider.getBlockTimestamp(),
    ]);
    const eligibleAt = createdAt + minAge;
    return eligibleAt > now ? eligibleAt - now : 0n;
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
   * Decrypt and return the plaintext amount `account` joined into a batch.
   * Acquires FHE credentials via a wallet signature if none are cached.
   */
  async depositOf(batchId: bigint, account: Address): Promise<bigint> {
    const normalizedAccount = getAddress(account);
    const encryptedValue = await this.confidentialDepositOf(batchId, normalizedAccount);
    if (isEncryptedValueZero(encryptedValue)) {
      return 0n;
    }
    const result = await this.sdk.decryption.decryptValues([
      { encryptedValue, contractAddress: this.address },
    ]);
    const value = result[encryptedValue];
    if (typeof value !== "bigint") {
      throw new DecryptionFailedError(`Decryption returned no value for ${encryptedValue}`);
    }
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
   * succeeds on chain and credits nothing — check the returned
   * `confidentialJoinedAmount`.
   */
  async join(amount: bigint, beneficiary?: Address): Promise<JoinResult> {
    this.#requireSigner("join");
    const account = await requireAlignedWalletAccount("join", this.sdk.signer, this.sdk.provider);
    const userAddress = getAddress(account.address);
    const resolvedBeneficiary = beneficiary ? getAddress(beneficiary) : userAddress;

    const { encryptedValues, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress,
    });

    const encryptedAmount = encryptedValues[0];
    if (!encryptedAmount) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    const result = await this.#submitTransaction(
      "join",
      joinContract(this.address, resolvedBeneficiary, encryptedAmount, inputProof),
    );

    const joined = findJoined(result.receipt.logs, this.address);
    if (!joined) {
      throw new TransactionRevertedError(
        `No Joined event from batcher ${this.address} found in the join receipt`,
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
   * Refunds the caller only — there is no third-party form, so a position
   * joined for a `beneficiary` can only be quit by that beneficiary.
   */
  async quit(batchId: bigint): Promise<TransactionResult> {
    this.#requireSigner("quit");
    await requireChainAlignment("quit", this.sdk.signer, this.sdk.provider);
    return this.#submitTransaction("quit", quitContract(this.address, batchId));
  }

  /**
   * Claim a finalized batch's output for `account`. Permissionless — anyone
   * can call this on another account's behalf, and the output always goes to
   * `account`, never to the caller. The amount is not returned; read it as a
   * balance on the batcher's {@link toToken}.
   *
   * Only legal once the batch reaches {@link BatchState.Finalized}; on a
   * canceled batch use {@link quit} instead.
   *
   * @param account - The account to claim for. Defaults to the connected wallet account.
   */
  async claim(batchId: bigint, account?: Address): Promise<TransactionResult> {
    const target = await this.#resolveTarget("claim", account);
    return this.#submitTransaction("claim", claimContract(this.address, batchId, target));
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
    return this.#submitTransaction("dispatchBatch", dispatchBatchContract(this.address));
  }

  // INTERNAL

  #requireSigner(operation: string): GenericSigner {
    if (!this.sdk.signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.sdk.signer;
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
    operation: string,
    config: WriteContractConfig,
  ): Promise<TransactionResult> {
    const signer = this.#requireSigner(operation);
    try {
      const txHash: Hex = await signer.writeContract(config);
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(`VaultBatcher transaction failed during ${operation}`, {
        cause: error,
      });
    }
  }
}
