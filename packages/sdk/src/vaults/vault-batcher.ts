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
  batchCreatedAtContract,
  batchDispatchedAtContract,
  batchStateContract,
  callbackDeadlineContract,
  claimContract,
  currentBatchIdContract,
  depositsContract,
  dispatchBatchContract,
  fromTokenContract,
  joinContract,
  minBatchAgeContract,
  quitContract,
  recoverContract,
  toTokenContract,
  totalDepositsContract,
  vaultContract,
} from "./contracts";

/**
 * Wraps an async address read so concurrent callers share one in-flight
 * request and a resolved value is never re-fetched — the value is immutable
 * for the batcher's lifetime (vault/fromToken/toToken are set at deploy time).
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
 * A confidential ERC-4626 vault batcher: batches deposits (or redemptions)
 * together, dispatches the aggregate through the underlying vault once
 * decrypted, and lets each participant claim their share.
 *
 * One `VaultBatcher` instance mirrors one on-chain batcher contract. A vault
 * has two directions — deposit and redeem — each behind its own batcher
 * contract; construct one `VaultBatcher` per direction, or use
 * `createVault` for a small convenience wrapper over both.
 *
 * @remarks
 * The lifecycle this class exposes — `join` → (someone calls
 * `dispatchBatch`) → `claim` — mirrors `WrappedToken.unshield`'s two-phase
 * request-then-finalize pattern, except the finalize step here
 * (`dispatchBatchCallback`) is driven by the relayer/KMS, not the caller.
 */
export class VaultBatcher {
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
   * The underlying ERC-4626 vault this batcher deposits into or redeems
   * from. Exchange rate / share price (`convertToShares`, `convertToAssets`,
   * `totalAssets`) lives on this vault contract itself, via the standard
   * ERC-4626 interface — not on the batcher. Resolved once and cached.
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
   * A batch's lifecycle state, as the raw number the contract stores. Observed
   * directly: `0` while still open and accepting {@link join}, `3` once settled.
   * Other values are unconfirmed — compare against the batcher contract's own
   * `BatchState` enum.
   */
  async batchState(batchId: bigint): Promise<number> {
    return this.sdk.provider.readContract(batchStateContract(this.address, batchId));
  }

  /** Minimum age (in seconds) a batch must reach before {@link dispatchBatch} can close it. */
  async minBatchAge(): Promise<bigint> {
    return this.sdk.provider.readContract(minBatchAgeContract(this.address));
  }

  /**
   * Maximum age (in seconds), *not* a timestamp despite the name, that a
   * dispatched batch is allowed to wait for its decryption callback before
   * it's eligible to be canceled. Combine with {@link batchDispatchedAt} to
   * get an absolute deadline for a specific batch.
   */
  async callbackDeadline(): Promise<bigint> {
    return this.sdk.provider.readContract(callbackDeadlineContract(this.address));
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
   * Seconds remaining until a batch reaches {@link minBatchAge} and becomes
   * eligible for {@link dispatchBatch} — `0` once it already is. Computed
   * against the chain's current block timestamp, not the caller's wall
   * clock, so it stays correct even if the local clock has drifted.
   *
   * Useful for showing a countdown or polling interval in a UI; not a
   * guarantee dispatch will succeed the moment this reaches `0` — someone
   * still has to submit the transaction, and it can be dispatched later than
   * this by anyone at any point afterward.
   */
  async timeUntilDispatchable(batchId: bigint): Promise<bigint> {
    const [createdAt, minAge, now] = await Promise.all([
      this.batchCreatedAt(batchId),
      this.minBatchAge(),
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
   * @param amount - The plaintext amount to contribute to the batch.
   * @param beneficiary - Recipient of the batch's eventual output. Defaults to the connected wallet account.
   * @returns The transaction hash and mined receipt.
   *
   * @remarks
   * This does not return the id of the batch the join landed in. The
   * authoritative source would be an event the batcher emits on `join` —
   * once that event's schema is verified against the real contract, this
   * method should decode the batch id from it, the way
   * `WrappedToken.unwrap` decodes `unwrapRequestId` from `UnwrapRequested`.
   * Until then, read {@link currentBatchId} right after this call resolves
   * as a best-effort approximation — it can be wrong if another account's
   * `dispatchBatch` call landed in the same window.
   */
  async join(amount: bigint, beneficiary?: Address): Promise<TransactionResult> {
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

    return this.#submitTransaction(
      "join",
      joinContract(this.address, resolvedBeneficiary, encryptedAmount, inputProof),
    );
  }

  /**
   * Undo the caller's own join before the batch is dispatched, returning the
   * joined amount to their confidential balance on `fromToken`.
   */
  async quit(batchId: bigint): Promise<TransactionResult> {
    this.#requireSigner("quit");
    await requireChainAlignment("quit", this.sdk.signer, this.sdk.provider);
    return this.#submitTransaction("quit", quitContract(this.address, batchId));
  }

  /**
   * Claim a finalized batch's output for `account`. Permissionless — anyone
   * can call this on another account's behalf; the output is always
   * delivered to `account`, never to the caller. Read the resulting balance
   * via a `Token` instance on the batcher's `toToken`, rather than
   * from this call's return value.
   *
   * @param account - The account to claim for. Defaults to the connected wallet account.
   */
  async claim(batchId: bigint, account?: Address): Promise<TransactionResult> {
    const target = await this.#resolveTarget("claim", account);
    return this.#submitTransaction("claim", claimContract(this.address, batchId, target));
  }

  /**
   * Recover funds after a batch was canceled (e.g. it failed to finalize
   * within {@link callbackDeadline}). The batch never executed against the
   * underlying vault, so this refunds the original `fromToken` amount — it
   * does not deliver a converted `toToken` output the way {@link claim} does.
   * Permissionless, same delivery semantics as `claim` otherwise (anyone can
   * call it on another account's behalf; the output always goes to `account`).
   *
   * @param account - The account to recover for. Defaults to the connected wallet account.
   */
  async recover(batchId: bigint, account?: Address): Promise<TransactionResult> {
    const target = await this.#resolveTarget("recover", account);
    return this.#submitTransaction("recover", recoverContract(this.address, batchId, target));
  }

  /**
   * Close the current batch once it has reached {@link minBatchAge} and
   * kick off decryption of its aggregate amount. Permissionless — any
   * account with a configured signer can call this, not just participants.
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
   * `account`, or the connected wallet address when `account` is omitted.
   * Always verifies signer/provider chain alignment — the connected signer
   * submits the transaction regardless of who the target account is.
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
