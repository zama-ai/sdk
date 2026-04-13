import { type Address, getAddress, type Hex, hexToBigInt } from "viem";
import {
  allowanceContract,
  approveContract,
  balanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  isOperatorContract,
  MAX_UINT64,
  revokeDelegationContract,
  setOperatorContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../contracts";
import { findUnwrapRequested } from "../events/onchain-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";
import {
  ApprovalFailedError,
  BalanceCheckUnavailableError,
  ConfigurationError,
  DecryptionFailedError,
  ERC20ReadFailedError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiredError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationSelfNotAllowedError,
  EncryptionFailedError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  TransactionRevertedError,
  ZamaError,
  matchAclRevert,
} from "../errors";
import { ReadonlyToken, type ReadonlyTokenConfig, wrapDecryptError } from "./readonly-token";
import { assertBigint } from "../utils/assertions";
import { pLimit } from "./concurrency";
import type {
  ShieldCallbacks,
  ShieldOptions,
  TransactionResult,
  TransferCallbacks,
  TransferOptions,
  UnshieldCallbacks,
  UnshieldOptions,
} from "../types";

/** Options for {@link Token.batchDecryptBalances}. */
export interface BatchDecryptOptions {
  /** Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. */
  handles?: Handle[];
  /** Balance owner address. Defaults to the connected signer. */
  owner?: Address;
  /**
   * Called when decryption fails for a single token. Return a fallback bigint value.
   * When omitted, errors are collected and thrown as an aggregated DecryptionFailedError.
   *
   * @example
   * ```ts
   * // Silent zero (old behavior):
   * onError: () => 0n
   * // Log and use zero:
   * onError: (err, addr) => { console.error(addr, err); return 0n; }
   * ```
   */
  onError?: (error: Error, address: Address) => bigint;
  /** Maximum number of concurrent decrypt calls. Default: `Infinity` (no limit). */
  maxConcurrency?: number;
}

/** Options for {@link Token.batchDecryptBalancesAs}. */
export interface BatchDecryptAsOptions {
  /** The address of the account that delegated decryption rights. */
  delegatorAddress: Address;
  /** Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. */
  handles?: Handle[];
  /** Balance owner address. Defaults to the delegator address. */
  owner?: Address;
  /** Maximum number of concurrent decrypt calls. Default: Infinity. */
  maxConcurrency?: number;
  /** Called when decryption fails for a single token. Return a fallback bigint. */
  onError?: (error: Error, address: Address) => bigint;
}

/**
 * ERC-20-like interface for a single confidential token.
 * Hides all FHE complexity (encryption, decryption, EIP-712 signing)
 * behind familiar methods.
 *
 * Extends ReadonlyToken with write operations
 * (transfer, shield, unshield).
 */
export interface TokenConfig extends ReadonlyTokenConfig {
  /** Override the wrapper address. Defaults to `address` (the token IS the wrapper). */
  wrapper?: Address;
}

export class Token extends ReadonlyToken {
  static readonly ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

  readonly wrapper: Address;
  #underlying: Address | undefined;
  #underlyingPromise: Promise<Address> | null = null;

  constructor(config: TokenConfig) {
    super(config);
    this.wrapper = config.wrapper ? getAddress(config.wrapper) : this.address;
  }

  async #getUnderlying(): Promise<Address> {
    if (this.#underlying !== undefined) {
      return this.#underlying;
    }
    if (!this.#underlyingPromise) {
      this.#underlyingPromise = this.signer
        .readContract(underlyingContract(this.wrapper))
        .then((v) => {
          this.#underlying = v;
          this.#underlyingPromise = null;
          return v;
        })
        .catch((error) => {
          this.#underlyingPromise = null;
          throw error;
        });
    }
    return this.#underlyingPromise;
  }

  // DECRYPT OPERATIONS

  /**
   * Decrypt and return the plaintext balance for the given owner.
   * Generates FHE credentials automatically if they don't exist.
   *
   * @param owner - Optional balance owner address. Defaults to the connected signer.
   * @returns The decrypted plaintext balance as a bigint.
   * @throws {@link DecryptionFailedError} if FHE decryption fails.
   *
   * @example
   * ```ts
   * const balance = await token.balanceOf();
   * // or for another address:
   * const balance = await token.balanceOf("0xOwner");
   * ```
   */
  async balanceOf(owner?: Address): Promise<bigint> {
    const ownerAddress = owner ? getAddress(owner) : await this.signer.getAddress();
    const handle = await this.confidentialBalanceOf(ownerAddress);
    return this.decryptBalance(handle, ownerAddress);
  }

  /**
   * Decrypt a single encrypted handle into a plaintext bigint.
   * Returns `0n` for zero handles without calling the relayer.
   *
   * @param handle - The encrypted balance handle to decrypt.
   * @param owner - Optional owner address for the decrypt request.
   * @returns The decrypted plaintext value as a bigint.
   * @throws {@link DecryptionFailedError} if FHE decryption fails.
   *
   * @example
   * ```ts
   * const handle = await token.confidentialBalanceOf();
   * const value = await token.decryptBalance(handle);
   * ```
   */
  async decryptBalance(handle: Handle, owner?: Address): Promise<bigint> {
    if (this.isZeroHandle(handle)) {
      return 0n;
    }

    const signerAddress = owner ?? (await this.signer.getAddress());

    const cached = await this.cache.get(signerAddress, this.address, handle);
    if (cached !== null) {
      assertBigint(cached, "decryptBalance: cached");
      return cached;
    }

    const creds = await this.credentials.allow(this.address);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.relayer.userDecrypt({
        handles: [handle],
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });

      const value = result[handle];
      if (value === undefined) {
        throw new DecryptionFailedError(`Decryption returned no value for handle ${handle}`);
      }
      assertBigint(value, "decryptBalance: result[handle]");
      await this.cache.set(signerAddress, this.address, handle, value);
      return value;
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt balance");
    }
  }

  /**
   * Batch-decrypt arbitrary encrypted handles for this token's contract.
   * Zero handles are returned as 0n without hitting the relayer. Non-zero
   * handles participate in the shared {@link DecryptCache}: values are
   * served from cache when present and written back on success so that
   * subsequent `sdk.userDecrypt` calls for the same `(contract, handle)`
   * skip the relayer round-trip.
   *
   * @param handles - Array of encrypted handles to decrypt.
   * @param owner - Optional owner address for the decrypt request.
   * @returns A Map from handle to decrypted bigint value.
   * @throws {@link DecryptionFailedError} if FHE decryption fails.
   */
  async decryptHandles(handles: Handle[], owner?: Address): Promise<Map<Handle, ClearValueType>> {
    const results = new Map<Handle, ClearValueType>();
    const uncachedHandles: Handle[] = [];
    const signerAddress = owner ?? (await this.signer.getAddress());

    for (const handle of handles) {
      if (this.isZeroHandle(handle)) {
        results.set(handle, 0n);
        continue;
      }
      const cached = await this.cache.get(signerAddress, this.address, handle);
      if (cached !== null) {
        results.set(handle, cached);
      } else {
        uncachedHandles.push(handle);
      }
    }

    if (uncachedHandles.length === 0) {
      return results;
    }

    const creds = await this.credentials.allow(this.address);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const decrypted = await this.relayer.userDecrypt({
        handles: uncachedHandles,
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });

      for (const handle of uncachedHandles) {
        const value = decrypted[handle];
        if (value === undefined) {
          throw new DecryptionFailedError(`Decryption returned no value for handle ${handle}`);
        }
        results.set(handle, value);
        await this.cache.set(signerAddress, this.address, handle, value);
      }
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt handles");
    }

    return results;
  }

  /**
   * Decrypt the balance of a delegator using delegated decryption credentials.
   * The connected signer acts as the delegate who has been granted permission
   * by the delegator to decrypt their balance.
   *
   * Decrypted values are cached in storage keyed by `(token, owner, handle)`.
   * Cache write failures are silently ignored — they do not affect the returned value.
   *
   * @param delegatorAddress - The address of the account that delegated decryption rights.
   * @param owner - Optional balance owner address. Defaults to the delegator address.
   * @returns The decrypted plaintext balance as a bigint.
   * @throws {@link DelegationNotFoundError} if no active delegation exists from the delegator to the connected signer.
   * @throws {@link DelegationExpiredError} if the delegation has expired.
   * @throws {@link DelegationNotPropagatedError} if the delegation exists on L1 but hasn't propagated to the gateway yet (typically 1–2 min after granting).
   * @throws {@link DecryptionFailedError} if delegated decryption fails or the relayer returns no value.
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   * @throws {@link SigningFailedError} if the signing operation fails.
   * @throws {@link NoCiphertextError} if the relayer returns HTTP 400 (no ciphertext for this account).
   * @throws {@link RelayerRequestFailedError} if the relayer returns a non-400 HTTP error.
   *
   * @example
   * ```ts
   * const balance = await token.decryptBalanceAs({
   *   delegatorAddress: "0xDelegator",
   * });
   * ```
   */
  async decryptBalanceAs({
    delegatorAddress,
    owner,
  }: {
    delegatorAddress: Address;
    owner?: Address;
  }): Promise<bigint> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedOwner = owner ? getAddress(owner) : normalizedDelegator;

    const handle = await this.confidentialBalanceOf(normalizedOwner);
    if (this.isZeroHandle(handle)) {
      return 0n;
    }

    const cached = await this.cache.get(normalizedOwner, this.address, handle);
    if (cached !== null) {
      assertBigint(cached, "decryptBalanceAs: cached");
      return cached;
    }

    // Pre-flight delegation check — avoids wasting a wallet signature on an
    // expired or non-existent delegation.
    await this.#assertDelegationActive(normalizedDelegator);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });

      const creds = await this.delegatedCredentials.allow(normalizedDelegator, this.address);

      const result = await this.relayer.delegatedUserDecrypt({
        handles: [handle],
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        delegatorAddress: creds.delegatorAddress,
        delegateAddress: creds.delegateAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });

      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });

      const value = result[handle];
      if (value === undefined) {
        throw new DecryptionFailedError(
          `Delegated decryption returned no value for handle ${handle}`,
        );
      }
      assertBigint(value, "decryptBalanceAs: result[handle]");
      await this.cache.set(normalizedOwner, this.address, handle, value);
      return value;
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt delegated balance", true);
    }
  }

  /**
   * Throws if there is no active delegation from `delegatorAddress` to the
   * connected signer for this token contract.
   */
  async #assertDelegationActive(delegatorAddress: Address): Promise<void> {
    const delegateAddress = await this.signer.getAddress();
    const expiry = await this.getDelegationExpiry({
      delegatorAddress,
      delegateAddress,
    });
    if (expiry === 0n) {
      throw new DelegationNotFoundError(
        `No active delegation from ${delegatorAddress} to ${delegateAddress} for ${this.address}`,
      );
    }
    if (expiry !== MAX_UINT64) {
      const now = await this.signer.getBlockTimestamp();
      if (expiry <= now) {
        throw new DelegationExpiredError(
          `Delegation from ${delegatorAddress} to ${delegateAddress} for ${this.address} has expired`,
        );
      }
    }
  }

  // BATCH DECRYPT OPERATIONS

  /**
   * Decrypt multiple token balances in parallel.
   * When `handles` are provided, decrypts them directly (useful for two-phase
   * polling where handles are already known). When omitted, fetches handles
   * from the chain first.
   *
   * **Error handling:** If a per-token decryption fails and no `onError` callback
   * is provided, errors are collected and thrown as an aggregated
   * `DecryptionFailedError`. When the relayer returns no value for a handle,
   * a `DecryptionFailedError` is thrown for that token (never silently returns `0n`).
   * Pass `onError: () => 0n` to opt into the silent zero behavior.
   *
   * @param tokens - Array of Token instances to decrypt balances for.
   * @param options - Optional configuration for handles, owner, error handling, and concurrency.
   * @returns A Map from token address to decrypted balance.
   * @throws {@link DecryptionFailedError} if any decryption fails and no `onError` callback is provided.
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   *
   * @example
   * ```ts
   * // Simple one-shot:
   * const balances = await Token.batchDecryptBalances(tokens);
   *
   * // With pre-fetched handles and error callback:
   * const handles = await Promise.all(tokens.map(t => t.confidentialBalanceOf()));
   * const balances = await Token.batchDecryptBalances(tokens, {
   *   handles,
   *   onError: (err, addr) => { console.error(addr, err); return 0n; },
   * });
   * ```
   */
  static async batchDecryptBalances(
    tokens: Token[],
    options?: BatchDecryptOptions,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) {
      return new Map();
    }

    const { handles, owner, onError, maxConcurrency } = options ?? {};
    const firstToken = tokens[0]!;
    const relayer = Token.#assertSameRelayer(tokens);
    const signerAddress = owner ?? (await firstToken.signer.getAddress());

    return Token.#batchDecryptCore({
      tokens,
      handles,
      ownerAddress: signerAddress,
      onError,
      maxConcurrency,
      obtainCreds: (uncachedAddresses) => firstToken.credentials.allow(...uncachedAddresses),
      decrypt: (creds, handle, contractAddress) =>
        relayer.userDecrypt({
          handles: [handle],
          contractAddress,
          signedContractAddresses: creds.contractAddresses,
          privateKey: creds.privateKey,
          publicKey: creds.publicKey,
          signature: creds.signature,
          signerAddress,
          startTimestamp: creds.startTimestamp,
          durationDays: creds.durationDays,
        }),
      errorPrefix: "Batch decryption",
    });
  }

  /**
   * Batch decrypt confidential balances as a delegate across multiple tokens.
   * Mirrors {@link batchDecryptBalances} but uses delegated credentials.
   *
   * **Error handling:** If a per-token decryption fails and no `onError` callback
   * is provided, errors are collected and thrown as an aggregated
   * `DecryptionFailedError`. When the relayer returns no value for a handle,
   * a `DecryptionFailedError` is thrown for that token (never silently returns `0n`).
   * Pass `onError: () => 0n` to opt into the silent zero behavior.
   *
   * @param tokens - Array of Token instances to decrypt balances for.
   * @param options - Delegated decryption configuration.
   * @returns A Map from token address to decrypted balance.
   * @throws {@link DelegationNotFoundError} if no active delegation exists from the delegator to the connected signer.
   * @throws {@link DelegationExpiredError} if the delegation has expired.
   * @throws {@link DecryptionFailedError} if any decryption fails and no `onError` callback is provided.
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   *
   * @example
   * ```ts
   * const balances = await Token.batchDecryptBalancesAs(tokens, {
   *   delegatorAddress: "0xDelegator",
   *   onError: (err, addr) => { console.error(addr, err); return 0n; },
   * });
   * ```
   */
  static async batchDecryptBalancesAs(
    tokens: Token[],
    options: BatchDecryptAsOptions,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) {
      return new Map();
    }

    const { delegatorAddress, handles, owner, onError, maxConcurrency } = options;
    const ownerAddress = owner ?? delegatorAddress;
    const firstToken = tokens[0]!;
    Token.#assertSameRelayer(tokens);

    return Token.#batchDecryptCore({
      tokens,
      handles,
      ownerAddress,
      onError,
      maxConcurrency,
      preFlightCheck: () => firstToken.#assertDelegationActive(delegatorAddress),
      obtainCreds: (uncachedAddresses) =>
        firstToken.delegatedCredentials.allow(delegatorAddress, ...uncachedAddresses),
      decrypt: (creds, handle, contractAddress) =>
        firstToken.relayer.delegatedUserDecrypt({
          handles: [handle],
          contractAddress,
          signedContractAddresses: creds.contractAddresses,
          privateKey: creds.privateKey,
          publicKey: creds.publicKey,
          signature: creds.signature,
          delegatorAddress: creds.delegatorAddress,
          delegateAddress: creds.delegateAddress,
          startTimestamp: creds.startTimestamp,
          durationDays: creds.durationDays,
        }),
      errorPrefix: "Batch delegated decryption",
    });
  }

  static async #batchDecryptCore<TCreds>(config: {
    tokens: Token[];
    handles: Handle[] | undefined;
    ownerAddress: Address;
    onError?: (error: Error, address: Address) => bigint;
    maxConcurrency?: number;
    preFlightCheck?: () => Promise<void>;
    obtainCreds: (uncachedAddresses: Address[]) => Promise<TCreds>;
    decrypt: (
      creds: TCreds,
      handle: Address,
      contractAddress: Address,
    ) => Promise<Record<string, unknown>>;
    errorPrefix: string;
  }): Promise<Map<Address, bigint>> {
    const {
      tokens,
      handles,
      ownerAddress,
      onError,
      maxConcurrency,
      obtainCreds,
      decrypt,
      errorPrefix,
    } = config;

    const firstToken = tokens[0]!;
    const resolvedHandles =
      handles ?? (await Promise.all(tokens.map((t) => t.confidentialBalanceOf(ownerAddress))));

    if (tokens.length !== resolvedHandles.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal handles.length (${resolvedHandles.length})`,
      );
    }

    const results = new Map<Address, bigint>();

    // Parallel cache lookups — avoids sequential IDB round-trips.
    const uncached: { token: Token; handle: Address }[] = [];
    const cachedValues = await Promise.all(
      tokens.map((token, i) => {
        const handle = resolvedHandles[i]!;
        if (token.isZeroHandle(handle)) {
          return 0n;
        }
        return firstToken.cache.get(ownerAddress, token.address, handle);
      }),
    );

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const handle = resolvedHandles[i]!;
      const cached = cachedValues[i];

      if (cached !== null && cached !== undefined) {
        assertBigint(cached, "batchDecryptCore: cached");
        results.set(token.address, cached);
        continue;
      }

      uncached.push({ token, handle });
    }

    // All balances resolved from cache — no credentials needed.
    if (uncached.length === 0) {
      return results;
    }

    // Pre-flight check runs after cache lookups — skips RPC overhead when
    // all balances are cached. Best-effort: checks the first token's contract
    // only (delegations are typically granted per-delegator, not per-token).
    if (config.preFlightCheck) {
      await config.preFlightCheck();
    }

    const uncachedAddresses = uncached.map((entry) => entry.token.address);
    const creds = await obtainCreds(uncachedAddresses);

    const errors: { address: Address; error: Error }[] = [];
    const decryptFns: (() => Promise<void>)[] = [];

    for (const { token, handle } of uncached) {
      decryptFns.push(() =>
        decrypt(creds, handle, token.address)
          .then(async (result) => {
            const value = result[handle];
            if (value === undefined) {
              throw new DecryptionFailedError(
                `${errorPrefix} returned no value for handle ${handle} on token ${token.address}`,
              );
            }
            assertBigint(value, "batchDecryptCore: result[handle]");
            results.set(token.address, value);
            void firstToken.cache.set(ownerAddress, token.address, handle, value);
          })
          .catch((error) => {
            const err = toError(error);
            if (onError) {
              try {
                results.set(token.address, onError(err, token.address));
              } catch (callbackError) {
                errors.push({
                  address: token.address,
                  error: toError(callbackError),
                });
              }
            } else {
              errors.push({ address: token.address, error: err });
            }
          }),
      );
    }

    await pLimit(decryptFns, maxConcurrency);

    if (errors.length > 0) {
      const message = errors.map((e) => `${e.address}: ${e.error.message}`).join("; ");
      throw new DecryptionFailedError(
        `${errorPrefix} failed for ${errors.length} token(s): ${message}`,
      );
    }

    return results;
  }

  /** Verify all tokens share the same relayer and return it. */
  static #assertSameRelayer(tokens: Token[]) {
    const relayer = tokens[0]!.relayer;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i]!.relayer !== relayer) {
        throw new ConfigurationError(
          "All tokens in a batch operation must share the same relayer instance",
        );
      }
    }
    return relayer;
  }

  // WRITE OPERATIONS

  /**
   * Confidential transfer. Encrypts the amount via FHE, then calls the contract.
   * Returns the transaction hash.
   *
   * By default, the SDK validates the confidential balance before submitting.
   * If a cached plaintext balance exists it is used; otherwise, if credentials
   * are cached, it decrypts on the fly. Set `skipBalanceCheck: true` to bypass
   * this validation (e.g. for smart wallets).
   *
   * @param to - Recipient address.
   * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
   * @param options - Optional: `skipBalanceCheck` (default `false`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link InsufficientConfidentialBalanceError} if the confidential balance is less than `amount`.
   * @throws {@link BalanceCheckUnavailableError} if balance validation is required but decryption is not possible (no cached credentials).
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n);
   * // Smart wallet (skip balance check):
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n, { skipBalanceCheck: true });
   * ```
   */
  async confidentialTransfer(
    to: Address,
    amount: bigint,
    options?: TransferOptions,
  ): Promise<TransactionResult> {
    const { skipBalanceCheck = false, onEncryptComplete, onTransferSubmitted } = options ?? {};

    const normalizedTo = getAddress(to);

    if (!skipBalanceCheck) {
      await this.#assertConfidentialBalance(amount);
    }

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.relayer.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.address,
        userAddress: await this.signer.getAddress(),
      }));
      this.emit({
        type: ZamaSDKEvents.EncryptEnd,
        durationMs: Date.now() - t0,
      });
      safeCallback(() => onEncryptComplete?.());
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Failed to encrypt transfer amount", {
        cause: error,
      });
    }

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await this.signer.writeContract(
        confidentialTransferContract(this.address, normalizedTo, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash });
      safeCallback(() => onTransferSubmitted?.(txHash));
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "transfer",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Transfer transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Operator encrypted transfer on behalf of another address.
   * The caller must be an approved operator for `from`.
   *
   * @param from - The address to transfer from (caller must be an approved operator).
   * @param to - Recipient address.
   * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
   * @returns The transaction hash and mined receipt.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
   * ```
   */
  async confidentialTransferFrom(
    from: Address,
    to: Address,
    amount: bigint,
    callbacks?: TransferCallbacks,
  ): Promise<TransactionResult> {
    const normalizedFrom = getAddress(from);
    const normalizedTo = getAddress(to);

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.relayer.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.address,
        userAddress: normalizedFrom,
      }));
      this.emit({
        type: ZamaSDKEvents.EncryptEnd,
        durationMs: Date.now() - t0,
      });
      safeCallback(() => callbacks?.onEncryptComplete?.());
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Failed to encrypt transferFrom amount", {
        cause: error,
      });
    }

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await this.signer.writeContract(
        confidentialTransferFromContract(
          this.address,
          normalizedFrom,
          normalizedTo,
          handles[0]!,
          inputProof,
        ),
      );
      this.emit({ type: ZamaSDKEvents.TransferFromSubmitted, txHash });
      safeCallback(() => callbacks?.onTransferSubmitted?.(txHash));
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "transferFrom",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("TransferFrom transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Set operator approval for the confidential token.
   * Defaults to 1 hour from now if `until` is not specified.
   *
   * @param spender - The address to approve as an operator.
   * @param until - Optional Unix timestamp for approval expiry. Defaults to now + 1 hour.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ApprovalFailedError} if the approval transaction fails.
   *
   * @example
   * ```ts
   * const txHash = await token.approve("0xSpender");
   * ```
   */
  async approve(spender: Address, until?: number): Promise<TransactionResult> {
    const normalizedSpender = getAddress(spender);
    try {
      const txHash = await this.signer.writeContract(
        setOperatorContract(this.address, normalizedSpender, until),
      );
      this.emit({ type: ZamaSDKEvents.ApproveSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "approve",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ApprovalFailedError("Operator approval failed", {
        cause: error,
      });
    }
  }

  /**
   * Check if a spender is an approved operator for a given holder.
   *
   * @param spender - The address to check operator approval for.
   * @param holder - The token holder address. Defaults to the connected wallet.
   * @returns `true` if the spender is an approved operator for the holder.
   *
   * @example
   * ```ts
   * if (await token.isApproved("0xSpender")) {
   *   // spender can call transferFrom on behalf of connected wallet
   * }
   * // or check for a specific holder:
   * if (await token.isApproved("0xSpender", "0xHolder")) { ... }
   * ```
   */
  async isApproved(spender: Address, holder?: Address): Promise<boolean> {
    const normalizedSpender = getAddress(spender);
    const resolvedHolder = holder ? getAddress(holder) : await this.signer.getAddress();
    return this.signer.readContract(
      isOperatorContract(this.address, resolvedHolder, normalizedSpender),
    );
  }

  /**
   * Shield public ERC-20 tokens into confidential tokens.
   * Handles ERC-20 approval automatically based on `approvalStrategy`
   * (`"exact"` by default, `"max"` for unlimited approval, `"skip"` to opt out).
   *
   * The ERC-20 balance is validated before submitting (public read, no signing
   * required).
   *
   * @param amount - The plaintext amount to shield.
   * @param options - Optional configuration: `approvalStrategy` (`"exact"` | `"max"` | `"skip"`, default `"exact"`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link InsufficientERC20BalanceError} if the ERC-20 balance is less than `amount`.
   * @throws {@link ApprovalFailedError} if the ERC-20 approval step fails.
   * @throws {@link TransactionRevertedError} if the shield transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.shield(1000n);
   * // or with exact approval:
   * const txHash = await token.shield(1000n, { approvalStrategy: "exact" });
   * ```
   */
  async shield(amount: bigint, options?: ShieldOptions): Promise<TransactionResult> {
    const underlying = await this.#getUnderlying();

    // ERC-20 balance check always runs (public read, no signing needed, works for all wallet types)
    let erc20Balance: bigint;
    try {
      const userAddress = await this.signer.getAddress();
      erc20Balance = await this.signer.readContract(balanceOfContract(underlying, userAddress));
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ERC20ReadFailedError(
        `Could not read ERC-20 balance for shield validation (token: ${underlying})`,
        { cause: toError(error) },
      );
    }
    if (erc20Balance < amount) {
      throw new InsufficientERC20BalanceError(
        `Insufficient ERC-20 balance: requested ${amount}, available ${erc20Balance} (token: ${underlying})`,
        { requested: amount, available: erc20Balance, token: underlying },
      );
    }

    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options);
    }

    try {
      const recipient = options?.to ? getAddress(options.to) : await this.signer.getAddress();
      const txHash = await this.signer.writeContract(wrapContract(this.wrapper, recipient, amount));
      this.emit({ type: ZamaSDKEvents.ShieldSubmitted, txHash });
      safeCallback(() => options?.onShieldSubmitted?.(txHash));
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "shield",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Shield transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Request an unwrap for a specific amount. Encrypts the amount first.
   * Call {@link finalizeUnwrap} after the request is processed on-chain.
   *
   * @param amount - The plaintext amount to unwrap (encrypted automatically).
   * @returns The transaction hash and mined receipt.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrap(500n);
   * ```
   */
  async unwrap(amount: bigint): Promise<TransactionResult> {
    const userAddress = await this.signer.getAddress();

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.relayer.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.wrapper,
        userAddress,
      }));
      this.emit({
        type: ZamaSDKEvents.EncryptEnd,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Failed to encrypt unshield amount", {
        cause: error,
      });
    }

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await this.signer.writeContract(
        unwrapContract(this.address, userAddress, userAddress, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "unwrap",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Unshield transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Request an unwrap for the entire confidential balance.
   * Uses the on-chain balance handle directly (no encryption needed).
   * Throws if the balance is zero.
   *
   * @returns The transaction hash and mined receipt.
   * @throws {@link DecryptionFailedError} if the balance is zero.
   * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrapAll();
   * ```
   */
  async unwrapAll(): Promise<TransactionResult> {
    const userAddress = await this.signer.getAddress();
    const handle = await this.readConfidentialBalanceOf(userAddress);

    if (this.isZeroHandle(handle)) {
      throw new DecryptionFailedError("Cannot unshield: balance is zero");
    }

    try {
      const txHash = await this.signer.writeContract(
        unwrapFromBalanceContract(this.address, userAddress, userAddress, handle),
      );
      this.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "unwrap",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Unshield-all transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Unshield a specific amount and finalize in one call.
   * Orchestrates: unshield → wait for receipt → parse event → finalize.
   *
   * By default, the SDK validates the confidential balance before submitting.
   * Set `skipBalanceCheck: true` to bypass this validation (e.g. for smart wallets).
   *
   * @param amount - The plaintext amount to unshield.
   * @param options - Optional: `skipBalanceCheck` (default `false`), `callbacks`.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link InsufficientConfidentialBalanceError} if the confidential balance is less than `amount`.
   * @throws {@link BalanceCheckUnavailableError} if balance validation is required but decryption is not possible.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unshield(500n);
   * // Smart wallet (skip balance check):
   * const txHash = await token.unshield(500n, { skipBalanceCheck: true });
   * ```
   */
  async unshield(amount: bigint, options?: UnshieldOptions): Promise<TransactionResult> {
    const {
      skipBalanceCheck = false,
      onUnwrapSubmitted,
      onFinalizing,
      onFinalizeSubmitted,
    } = options ?? {};

    if (!skipBalanceCheck) {
      await this.#assertConfidentialBalance(amount);
    }

    const callbacks: UnshieldCallbacks = {
      onFinalizing,
      onFinalizeSubmitted,
    };
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrap(amount);
    safeCallback(() => onUnwrapSubmitted?.(unwrapResult.txHash));
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, operationId, callbacks);
  }

  /**
   * Unshield the entire balance and finalize in one call.
   * Orchestrates: unshieldAll → wait for receipt → parse event → finalize.
   *
   * @param callbacks - Optional progress callbacks for each phase.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link DecryptionFailedError} if the balance is zero.
   * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unshieldAll();
   * ```
   */
  async unshieldAll(callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrapAll();
    safeCallback(() => callbacks?.onUnwrapSubmitted?.(unwrapResult.txHash));
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, operationId, callbacks);
  }

  /**
   * Resume an in-progress unshield from an existing unwrap tx hash.
   * Useful when the user already submitted the unwrap but the finalize step
   * was interrupted (e.g. page reload, network error).
   *
   * @param unwrapTxHash - The transaction hash of the previously submitted unwrap.
   * @param callbacks - Optional progress callbacks.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if finalization fails.
   *
   * @example
   * ```ts
   * const txHash = await token.resumeUnshield(previousUnwrapTxHash);
   * ```
   */
  async resumeUnshield(
    unwrapTxHash: Hex,
    callbacks?: UnshieldCallbacks,
  ): Promise<TransactionResult> {
    return this.#waitAndFinalizeUnshield(unwrapTxHash, crypto.randomUUID(), callbacks);
  }

  /**
   * Complete an unwrap by providing the public decryption proof.
   * Call this after an unshield request has been processed on-chain.
   *
   * @param burnAmountHandle - The encrypted amount handle from the `UnwrapRequested` event.
   * @returns The transaction hash and mined receipt.
   * @throws {@link DecryptionFailedError} if public decryption fails.
   * @throws {@link TransactionRevertedError} if the finalize transaction reverts.
   *
   * @example
   * ```ts
   * const event = findUnwrapRequested(receipt.logs);
   * const txHash = await token.finalizeUnwrap(event.encryptedAmount);
   * ```
   */
  async finalizeUnwrap(burnAmountHandle: Handle): Promise<TransactionResult> {
    let clearValue: bigint;
    let decryptionProof: Hex;

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.relayer.publicDecrypt([burnAmountHandle]);
      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });
      decryptionProof = result.decryptionProof;
      try {
        clearValue = hexToBigInt(result.abiEncodedClearValues);
      } catch (error) {
        throw new DecryptionFailedError(
          `Cannot parse decrypted value: ${result.abiEncodedClearValues}`,
          { cause: error },
        );
      }
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new DecryptionFailedError("Failed to finalize unshield", {
        cause: error,
      });
    }

    try {
      const txHash = await this.signer.writeContract(
        finalizeUnwrapContract(this.wrapper, burnAmountHandle, clearValue, decryptionProof),
      );
      this.emit({ type: ZamaSDKEvents.FinalizeUnwrapSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "finalizeUnwrap",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Failed to finalize unshield", {
        cause: error,
      });
    }
  }

  /**
   * Approve this token contract to spend the underlying ERC-20.
   * Defaults to max uint256. Resets to zero first if there's an existing
   * non-zero allowance (required by tokens like USDT).
   *
   * @param amount - Optional approval amount. Defaults to max uint256.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ApprovalFailedError} if the approval transaction fails.
   *
   * @example
   * ```ts
   * await token.approveUnderlying(); // max approval
   * await token.approveUnderlying(1000n); // exact amount
   * ```
   */
  async approveUnderlying(amount?: bigint): Promise<TransactionResult> {
    const underlying = await this.#getUnderlying();

    const approvalAmount = amount ?? 2n ** 256n - 1n;

    try {
      if (approvalAmount > 0n) {
        const userAddress = await this.signer.getAddress();
        const currentAllowance = await this.signer.readContract(
          allowanceContract(underlying, userAddress, this.wrapper),
        );

        if (currentAllowance > 0n) {
          await this.signer.writeContract(approveContract(underlying, this.wrapper, 0n));
        }
      }

      const txHash = await this.signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "approveUnderlying",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ApprovalFailedError("ERC-20 approval failed", {
        cause: error,
      });
    }
  }

  // DELEGATION OPERATIONS

  /**
   * Delegate decryption rights for this token to another address.
   * Calls `ACL.delegateForUserDecryption()` on-chain.
   *
   * **Important:** After the transaction is mined, allow **1–2 minutes** before
   * calling {@link ReadonlyToken.decryptBalanceAs | decryptBalanceAs}. The delegation
   * is recorded on L1 immediately, but the gateway (on Arbitrum) must sync the
   * ACL state via cross-chain event propagation. Attempting delegated decryption
   * before propagation completes will throw a
   * {@link DelegationNotPropagatedError}.
   *
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date (defaults to permanent delegation via `uint64.max`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if the delegation transaction reverts.
   */
  async delegateDecryption({
    delegateAddress,
    expirationDate,
  }: {
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<TransactionResult> {
    if (expirationDate && expirationDate.getTime() < Date.now() + 3600_000) {
      throw new DelegationExpirationTooSoonError(
        "Expiration date must be at least 1 hour in the future",
      );
    }

    const normalizedDelegate = getAddress(delegateAddress);

    // Pre-flight: delegate cannot be the connected wallet (SenderCannotBeDelegate)
    const signerAddress = await this.signer.getAddress();
    if (normalizedDelegate === getAddress(signerAddress)) {
      throw new DelegationSelfNotAllowedError(
        "Cannot delegate to yourself (delegate === msg.sender).",
      );
    }

    // Pre-flight: delegate cannot be the contract address (DelegateCannotBeContractAddress)
    if (normalizedDelegate === this.address) {
      throw new DelegationDelegateEqualsContractError(
        `Delegate address cannot be the same as the contract address (${this.address}).`,
      );
    }

    const acl = await this.getAclAddress();
    // uint64 max → no practical expiry
    const expDate = expirationDate
      ? BigInt(Math.floor(expirationDate.getTime() / 1000))
      : MAX_UINT64;

    // Pre-flight with RPC: new expiry must differ from current (ExpirationDateAlreadySetToSameValue)
    let currentExpiry: bigint;
    try {
      currentExpiry = await this.getDelegationExpiry({
        delegatorAddress: signerAddress,
        delegateAddress: normalizedDelegate,
      });
    } catch {
      currentExpiry = -1n; // RPC failure — skip client-side check, let the contract enforce
    }
    if (currentExpiry === expDate) {
      throw new DelegationExpiryUnchangedError(
        `The new expiration date (${expDate}) is the same as the current one. No on-chain change needed.`,
      );
    }

    try {
      const txHash = await this.signer.writeContract(
        delegateForUserDecryptionContract(acl, normalizedDelegate, this.address, expDate),
      );
      this.emit({ type: ZamaSDKEvents.DelegationSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "delegateDecryption",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      const mapped = matchAclRevert(error);
      if (mapped) {
        throw mapped;
      }
      throw new TransactionRevertedError("Delegation transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Revoke decryption delegation for this token.
   * Calls `ACL.revokeDelegationForUserDecryption()` on-chain.
   *
   * @param delegateAddress - Address to revoke delegation from.
   * @returns The transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if the revocation transaction reverts.
   */
  async revokeDelegation({
    delegateAddress,
  }: {
    delegateAddress: Address;
  }): Promise<TransactionResult> {
    const normalizedDelegate = getAddress(delegateAddress);
    const signerAddress = await this.signer.getAddress();
    const acl = await this.getAclAddress();

    // Pre-flight: reject if never delegated (expiry === 0).
    // Expired delegations (non-zero expiry in the past) are allowed through —
    // the ACL contract accepts revocation of expired delegations.
    let currentExpiry: bigint;
    try {
      currentExpiry = await this.getDelegationExpiry({
        delegatorAddress: signerAddress,
        delegateAddress: normalizedDelegate,
      });
    } catch {
      currentExpiry = 1n; // RPC failure — skip client-side check, let the contract enforce
    }
    if (currentExpiry === 0n) {
      throw new DelegationNotFoundError(
        `No active delegation found for delegate ${normalizedDelegate} on contract ${this.address}.`,
      );
    }

    try {
      const txHash = await this.signer.writeContract(
        revokeDelegationContract(acl, normalizedDelegate, this.address),
      );
      this.emit({ type: ZamaSDKEvents.RevokeDelegationSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "revokeDelegation",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      const mapped = matchAclRevert(error);
      if (mapped) {
        throw mapped;
      }
      throw new TransactionRevertedError("Revoke delegation transaction failed", {
        cause: error,
      });
    }
  }

  // BATCH DELEGATION

  /**
   * Delegate decryption rights across multiple tokens in parallel.
   * Returns a per-token result map with partial success semantics.
   *
   * @param tokens - Array of Token instances to delegate on.
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date.
   * @returns Map from token address to TransactionResult or ZamaError.
   */
  static async batchDelegateDecryption({
    tokens,
    delegateAddress,
    expirationDate,
  }: {
    tokens: Token[];
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<Map<Address, TransactionResult | ZamaError>> {
    return Token.#batchDelegationOp(
      tokens,
      (t) => t.delegateDecryption({ delegateAddress, expirationDate }),
      "Delegation failed",
    );
  }

  /**
   * Revoke delegation across multiple tokens in parallel.
   * Returns a per-token result map with partial success semantics.
   *
   * @param tokens - Array of Token instances to revoke delegation on.
   * @param delegateAddress - Address to revoke delegation from.
   * @returns Map from token address to TransactionResult or ZamaError.
   */
  static async batchRevokeDelegation({
    tokens,
    delegateAddress,
  }: {
    tokens: Token[];
    delegateAddress: Address;
  }): Promise<Map<Address, TransactionResult | ZamaError>> {
    return Token.#batchDelegationOp(
      tokens,
      (t) => t.revokeDelegation({ delegateAddress }),
      "Revoke delegation failed",
    );
  }

  static async #batchDelegationOp(
    tokens: Token[],
    op: (token: Token) => Promise<TransactionResult>,
    errorMessage: string,
  ): Promise<Map<Address, TransactionResult | ZamaError>> {
    const results = new Map<Address, TransactionResult | ZamaError>();
    // Run sequentially: parallel writeContract calls from the same signer
    // cause nonce contention. The value of the batch API is partial-success
    // semantics (per-token results without throwing), not parallelism.
    for (let i = 0; i < tokens.length; i++) {
      try {
        results.set(tokens[i]!.address, await op(tokens[i]!));
      } catch (error) {
        if (error instanceof ZamaError) {
          results.set(tokens[i]!.address, error);
        } else {
          results.set(
            tokens[i]!.address,
            new TransactionRevertedError(errorMessage, {
              cause: error,
            }),
          );
        }
      }
    }
    return results;
  }

  // PRIVATE HELPERS

  /**
   * Pre-flight check: decrypt the confidential balance and compare against the
   * requested amount. If credentials are cached the decrypt happens silently;
   * if not, throws {@link BalanceCheckUnavailableError} instead of triggering
   * a surprise EIP-712 popup.
   */
  async #assertConfidentialBalance(amount: bigint): Promise<void> {
    // Zero-amount operations trivially satisfy the balance constraint.
    if (amount === 0n) {
      return;
    }

    let userAddress: Address;
    let handle: Handle;
    try {
      userAddress = await this.signer.getAddress();
      handle = await this.readConfidentialBalanceOf(userAddress);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new BalanceCheckUnavailableError(
        `Could not read confidential balance handle (token: ${this.address})`,
        { cause: toError(error) },
      );
    }

    if (this.isZeroHandle(handle)) {
      throw new InsufficientConfidentialBalanceError(
        `Insufficient confidential balance: requested ${amount}, available 0 (token: ${this.address})`,
        { requested: amount, available: 0n, token: this.address },
      );
    }

    // Check the persistent plaintext cache first — if the balance was decrypted
    // in a previous session, we can validate without credentials or a new decrypt.
    const cachedRaw = await this.cache.get(userAddress, this.address, handle);
    if (typeof cachedRaw === "bigint") {
      if (cachedRaw < amount) {
        throw new InsufficientConfidentialBalanceError(
          `Insufficient confidential balance: requested ${amount}, available ${cachedRaw} (token: ${this.address})`,
          { requested: amount, available: cachedRaw, token: this.address },
        );
      }
      return;
    }

    // Cache miss — only attempt decryption when credentials are already cached.
    // This avoids triggering an unexpected EIP-712 signing popup during
    // a transfer/unshield flow (respects the explicit-action pattern from SDK-42).
    //
    // Note: isAllowed() is a wallet-scoped session check. If credentials exist
    // but don't yet cover this token's contract address, decryptBalance() may
    // still trigger a signing prompt for contract extension. This is acceptable:
    // it only happens when the user interacts with a new token for the first
    // time while having an active session — a signing prompt is expected there.
    let hasCredentials: boolean;
    try {
      hasCredentials = await this.isAllowed();
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new BalanceCheckUnavailableError(
        `Could not check credential status for balance validation (token: ${this.address})`,
        { cause: error },
      );
    }
    if (!hasCredentials) {
      throw new BalanceCheckUnavailableError(
        `Cannot validate confidential balance: no cached credentials. ` +
          `Call allow() first or use skipBalanceCheck: true for smart wallets (token: ${this.address})`,
      );
    }

    let balance: bigint;
    try {
      balance = await this.decryptBalance(handle, userAddress);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new BalanceCheckUnavailableError(
        `Balance validation failed: could not decrypt confidential balance (token: ${this.address})`,
        { cause: error },
      );
    }

    if (balance < amount) {
      throw new InsufficientConfidentialBalanceError(
        `Insufficient confidential balance: requested ${amount}, available ${balance} (token: ${this.address})`,
        { requested: amount, available: balance, token: this.address },
      );
    }
  }

  async #waitAndFinalizeUnshield(
    unshieldHash: Hex,
    operationId: string,
    callbacks: UnshieldCallbacks | undefined,
  ): Promise<TransactionResult> {
    this.emit({
      type: ZamaSDKEvents.UnshieldPhase1Submitted,
      txHash: unshieldHash,
      operationId,
    });
    let receipt;
    try {
      receipt = await this.signer.waitForTransactionReceipt(unshieldHash);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Failed to get unshield receipt", {
        cause: error,
      });
    }
    const event = findUnwrapRequested(receipt.logs);
    if (!event) {
      throw new TransactionRevertedError("No UnwrapRequested event found in unshield receipt");
    }
    this.emit({ type: ZamaSDKEvents.UnshieldPhase2Started, operationId });
    safeCallback(() => callbacks?.onFinalizing?.());
    const finalizeResult = await this.finalizeUnwrap(event.encryptedAmount);
    this.emit({
      type: ZamaSDKEvents.UnshieldPhase2Submitted,
      txHash: finalizeResult.txHash,
      operationId,
    });
    safeCallback(() => callbacks?.onFinalizeSubmitted?.(finalizeResult.txHash));
    return finalizeResult;
  }

  async #ensureAllowance(
    amount: bigint,
    maxApproval: boolean,
    callbacks?: ShieldCallbacks,
  ): Promise<void> {
    const underlying = await this.#getUnderlying();

    const userAddress = await this.signer.getAddress();
    const allowance = await this.signer.readContract(
      allowanceContract(underlying, userAddress, this.wrapper),
    );

    if (allowance >= amount) {
      return;
    }

    try {
      // Reset to zero first when there's an existing non-zero allowance.
      // Required by non-standard tokens like USDT, and also mitigates the
      // ERC-20 approve race condition for all tokens.
      if (allowance > 0n) {
        await this.signer.writeContract(approveContract(underlying, this.wrapper, 0n));
      }

      const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;

      const txHash = await this.signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      safeCallback(() => callbacks?.onApprovalSubmitted?.(txHash));
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ApprovalFailedError("ERC-20 approval failed", {
        cause: error,
      });
    }
  }
}

/**
 * Invoke a callback inside a try/catch so a throwing listener
 * can never break the unshield flow (unwrap already on-chain).
 */
function safeCallback(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.warn("[zama-sdk] Callback threw:", error);
  }
}
