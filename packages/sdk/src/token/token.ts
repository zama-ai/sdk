import { type Address, getAddress } from "viem";
import {
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID_LEGACY,
  isOperatorContract,
  nameContract,
  setOperatorContract,
  supportsInterfaceContract,
  symbolContract,
} from "../contracts";
import {
  ApprovalFailedError,
  BalanceCheckUnavailableError,
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
  InsufficientConfidentialBalanceError,
  isFatalBatchError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertBigint } from "../utils/assertions";
import { pLimit } from "../utils/concurrency";
import { isZeroHandle } from "../utils/handles";
import { swallow } from "../utils/swallow";
import type { TransactionResult, TransferCallbacks, TransferOptions } from "../types";
import type { ZamaSDK } from "../zama-sdk";

/** Options for {@link Token.batchDecryptBalancesAs}. */
export interface BatchDecryptAsOptions {
  /** The address of the account that delegated decryption rights. */
  delegatorAddress: Address;
  /** Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. */
  handles?: Handle[];
  /**
   * The account whose on-chain balance to read. Defaults to the delegator
   * address, which is the common case (the delegator grants permission to
   * decrypt their own balance). Only set this when the account differs
   * from the delegator.
   *
   * Matches the `account` parameter of `confidentialBalanceOf(account)` on-chain.
   */
  accountAddress?: Address;
  /** Maximum number of concurrent decrypt calls. Default: 10. */
  maxConcurrency?: number;
  /** Called when decryption fails for a single token. Return a fallback bigint. */
  onError?: (error: Error, address: Address) => bigint;
}

/** Result of {@link Token.batchBalancesOf}. */
export interface BatchBalancesResult {
  /** Successfully decrypted balances, keyed by token address. */
  results: Map<Address, bigint>;
  /** Per-token errors for tokens that failed to decrypt. */
  errors: Map<Address, ZamaError>;
}

/**
 * High-level interface for an ERC-7984 confidential token.
 * Hides FHE complexity (encryption, decryption, EIP-712 signing) behind
 * familiar ERC-20-like methods.
 *
 * For ERC-7984 wrappers (shield/unshield), use {@link WrappedToken} instead —
 * it extends `Token` with wrapper-specific operations.
 *
 * Decryption, credentials, caching, and event emission are handled by the
 * owning {@link ZamaSDK} — this class only exposes token-scoped helpers
 * that delegate to {@link ZamaSDK.userDecrypt} and {@link ZamaSDK.allow}.
 */
export class Token {
  readonly sdk: ZamaSDK;
  readonly address: Address;

  constructor(sdk: ZamaSDK, address: Address) {
    this.sdk = sdk;
    this.address = getAddress(address);
  }

  // METADATA

  /** Read the token name from the contract. */
  async name(): Promise<string> {
    return this.sdk.provider.readContract(nameContract(this.address));
  }

  /** Read the token symbol from the contract. */
  async symbol(): Promise<string> {
    return this.sdk.provider.readContract(symbolContract(this.address));
  }

  /** Read the token decimals from the contract. */
  async decimals(): Promise<number> {
    return this.sdk.provider.readContract(decimalsContract(this.address));
  }

  // ERC-165 DISCOVERY

  /**
   * ERC-165 check for {@link ERC7984_INTERFACE_ID} support.
   *
   * @returns `true` if the contract implements the ERC-7984 confidential token interface.
   */
  async isConfidential(): Promise<boolean> {
    return this.sdk.provider.readContract(
      supportsInterfaceContract(this.address, ERC7984_INTERFACE_ID),
    );
  }

  /**
   * ERC-165 check for IERC7984ERC20Wrapper support.
   *
   * During the transition period, checks both {@link ERC7984_WRAPPER_INTERFACE_ID_LEGACY}
   * (`0xd04584ba`) and {@link ERC7984_WRAPPER_INTERFACE_ID} (`0x1f1c62b2`) in parallel,
   * returning `true` if either matches.
   *
   * @returns `true` if the contract implements the ERC-7984 wrapper interface.
   */
  async isWrapper(): Promise<boolean> {
    const [legacyMatch, newMatch] = await Promise.all([
      this.sdk.provider.readContract(
        supportsInterfaceContract(this.address, ERC7984_WRAPPER_INTERFACE_ID_LEGACY),
      ),
      this.sdk.provider.readContract(
        supportsInterfaceContract(this.address, ERC7984_WRAPPER_INTERFACE_ID),
      ),
    ]);
    return legacyMatch || newMatch;
  }

  // BALANCES

  /**
   * Decrypt and return the plaintext balance for the given owner.
   * Acquires FHE credentials via a wallet signature if none are cached.
   *
   * @param owner - Balance owner address.
   * @returns The decrypted plaintext balance as a bigint.
   * @throws {@link DecryptionFailedError} if FHE decryption fails.
   *
   * @example
   * ```ts
   * const balance = await token.balanceOf("0xOwner");
   * ```
   */
  async balanceOf(owner: Address): Promise<bigint> {
    const ownerAddress = getAddress(owner);
    const handle = await this.readConfidentialBalanceOf(ownerAddress);
    const result = await this.sdk.userDecrypt([{ handle, contractAddress: this.address }]);
    const value = result[handle];
    if (value === undefined) {
      throw new DecryptionFailedError(`Decryption returned no value for handle ${handle}`);
    }
    assertBigint(value, "balanceOf: result[handle]");
    return value;
  }

  /**
   * Return the raw encrypted balance handle without decrypting.
   *
   * @param owner - Balance owner address.
   * @returns The encrypted balance handle as a hex string.
   *
   * @example
   * ```ts
   * const handle = await token.confidentialBalanceOf("0xOwner");
   * ```
   */
  async confidentialBalanceOf(owner: Address): Promise<Handle> {
    return this.readConfidentialBalanceOf(getAddress(owner));
  }

  /**
   * Decrypt the balance of a delegator using delegated decryption credentials.
   * The connected signer acts as the delegatee who has been granted permission
   * by the delegator to decrypt their balance.
   *
   * Decrypted values are cached in storage keyed by `(account, token, handle)`.
   * Because every on-chain balance change produces a new encrypted handle,
   * stale cache entries are never served. Cache write failures are silently
   * ignored — they do not affect the returned value.
   *
   * @param delegatorAddress - The address of the account that delegated decryption rights.
   * @param accountAddress - The account whose on-chain balance to read. Defaults
   *   to the delegator address.
   * @returns The decrypted plaintext balance as a bigint.
   * @throws {@link DelegationNotFoundError} if no active delegation exists.
   * @throws {@link DelegationExpiredError} if the delegation has expired.
   * @throws {@link DecryptionFailedError} if delegated decryption fails.
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
    accountAddress,
  }: {
    delegatorAddress: Address;
    accountAddress?: Address;
  }): Promise<bigint> {
    await requireChainAlignment("decryptBalanceAs", this.sdk.signer, this.sdk.provider);
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedAccount = accountAddress ? getAddress(accountAddress) : normalizedDelegator;

    const handle = await this.readConfidentialBalanceOf(normalizedAccount);
    if (isZeroHandle(handle)) {
      return 0n;
    }

    const result = await this.sdk.delegatedUserDecrypt(
      [{ handle, contractAddress: this.address }],
      normalizedDelegator,
      normalizedAccount,
    );

    const value = result[handle];
    if (value === undefined) {
      throw new DecryptionFailedError(
        `Delegated decryption returned no value for handle ${handle}`,
      );
    }
    assertBigint(value, "decryptBalanceAs: result[handle]");
    return value;
  }

  // BATCH STATICS

  /**
   * Decrypt confidential balances for multiple tokens in parallel, returning
   * successes and per-token errors separately. Pre-authorizes all token
   * addresses in a single wallet signature, then delegates each decrypt to
   * {@link ZamaSDK.userDecrypt}.
   *
   * Tokens that fail to decrypt land in `errors` rather than aborting the
   * whole batch — caller decides how to surface them.
   *
   * @param tokens - Array of {@link Token} instances bound to the same SDK.
   * @param owner - Balance owner address.
   * @returns `{ results, errors }` partitioning the per-token outcomes.
   *
   * @example
   * ```ts
   * const { results, errors } = await Token.batchBalancesOf(tokens, owner);
   * ```
   */
  static async batchBalancesOf(tokens: Token[], owner: Address): Promise<BatchBalancesResult> {
    const results = new Map<Address, bigint>();
    const errors = new Map<Address, ZamaError>();
    if (tokens.length === 0) {
      return { results, errors };
    }

    const sdk = Token.assertSameSdk(tokens);
    // Fail fast on chain mismatch before prompting the wallet for a signature.
    await requireChainAlignment("batchBalancesOf", sdk.signer, sdk.provider);
    // Pre-authorize the full token set in one wallet signature so subsequent
    // per-token userDecrypt calls reuse the cached credentials.
    await sdk.allow(tokens.map((t) => t.address));

    const outcomes = await pLimit(
      tokens.map((t) => async () => {
        try {
          return {
            status: "fulfilled" as const,
            value: await t.balanceOf(owner),
          };
        } catch (reason) {
          return { status: "rejected" as const, reason };
        }
      }),
      5,
    );

    for (let i = 0; i < tokens.length; i++) {
      const tokenAddress = tokens[i]!.address;
      const outcome = outcomes[i]!;
      if (outcome.status === "fulfilled") {
        results.set(tokenAddress, outcome.value);
      } else {
        const reason = outcome.reason;
        // Session-level failures (user rejected signature, SDK misconfigured)
        // apply to every token — surface them instead of collecting per-token.
        if (isFatalBatchError(reason)) {
          throw reason;
        }
        const error =
          reason instanceof ZamaError
            ? reason
            : new DecryptionFailedError(toError(reason).message, {
                cause: reason,
              });
        errors.set(tokenAddress, error);
      }
    }

    // Total failure: surface the first error so callers know nothing decrypted.
    if (errors.size === tokens.length) {
      const firstError = errors.values().next().value;
      throw firstError ?? new DecryptionFailedError("All token balance decryptions failed");
    }

    return { results, errors };
  }

  /**
   * Batch decrypt confidential balances as a delegate across multiple tokens.
   * Mirrors {@link batchBalancesOf} but uses delegated credentials.
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
   * @throws {@link DelegationNotFoundError} if no active delegation exists.
   * @throws {@link DelegationExpiredError} if the delegation has expired.
   * @throws {@link DecryptionFailedError} if any decryption fails and no `onError` is provided.
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

    const sdk = Token.assertSameSdk(tokens);
    const results = new Map<Address, bigint>();
    const errors = new Map<Address, ZamaError>();
    const normalizedAccount = options.accountAddress
      ? getAddress(options.accountAddress)
      : getAddress(options.delegatorAddress);
    const maxConcurrency = options.maxConcurrency ?? 10;
    if (options.handles && tokens.length !== options.handles.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal handles.length (${options.handles.length})`,
      );
    }
    const resolvedHandles =
      options.handles ??
      (await Token.readBalanceHandlesBatch(tokens, normalizedAccount, errors, maxConcurrency));

    const decryptRequests: Array<{ token: Token; handle: Handle }> = [];
    for (const [index, token] of tokens.entries()) {
      const handle = resolvedHandles[index];
      if (!handle || errors.has(token.address)) {
        continue;
      }
      if (isZeroHandle(handle)) {
        // Zero balance → skip the relayer; no decryption needed.
        results.set(token.address, 0n);
      } else {
        decryptRequests.push({ token, handle });
      }
    }

    if (decryptRequests.length > 0) {
      const decrypted = await sdk.delegatedBatchDecryptHandlesAs({
        handles: decryptRequests.map(({ token, handle }) => ({
          handle,
          contractAddress: token.address,
        })),
        delegatorAddress: options.delegatorAddress,
        accountAddress: options.accountAddress,
        maxConcurrency,
      });

      for (const [index, item] of decrypted.items.entries()) {
        const request = decryptRequests[index];
        if (!request) {
          continue;
        }
        if (item.error) {
          errors.set(request.token.address, item.error);
          continue;
        }
        const value = item.value;
        if (value === undefined) {
          errors.set(
            request.token.address,
            new DecryptionFailedError(
              `Batch delegated decryption returned no value for handle ${item.handle} on token ${request.token.address}`,
            ),
          );
          continue;
        }
        assertBigint(value, "batchDecryptBalancesAs: result[handle]");
        results.set(request.token.address, value);
      }
    }

    if (errors.size === 0) {
      return results;
    }

    if (options.onError) {
      const callbackErrors: Array<{ address: Address; error: Error }> = [];
      for (const [address, error] of errors) {
        try {
          results.set(address, options.onError(error, address));
        } catch (callbackError) {
          callbackErrors.push({ address, error: toError(callbackError) });
        }
      }
      if (callbackErrors.length > 0) {
        const message = callbackErrors
          .map(({ address, error }) => `${address}: ${error.message}`)
          .join("; ");
        throw new DecryptionFailedError(
          `Batch delegated decryption onError callback failed for ${callbackErrors.length} token(s): ${message}`,
          { cause: callbackErrors[0]?.error },
        );
      }
      return results;
    }

    const errorEntries = Array.from(errors.entries());
    const message = errorEntries.map(([addr, e]) => `${addr}: ${e.message}`).join("; ");
    throw new DecryptionFailedError(
      `Batch delegated decryption failed for ${errors.size} token(s): ${message}`,
      { cause: errorEntries[0]?.[1] },
    );
  }

  private static async readBalanceHandlesBatch(
    tokens: Token[],
    accountAddress: Address,
    errors: Map<Address, ZamaError>,
    maxConcurrency: number,
  ): Promise<Array<Handle | undefined>> {
    const outcomes = await pLimit(
      tokens.map((token) => async () => {
        try {
          return {
            status: "fulfilled" as const,
            value: await token.readConfidentialBalanceOf(accountAddress),
          };
        } catch (reason) {
          return { status: "rejected" as const, reason };
        }
      }),
      maxConcurrency,
    );

    const handles: Array<Handle | undefined> = [];
    for (const [index, token] of tokens.entries()) {
      const outcome = outcomes[index];
      if (!outcome) {
        continue;
      }
      if (outcome.status === "fulfilled") {
        handles[index] = outcome.value;
        continue;
      }
      if (isFatalBatchError(outcome.reason)) {
        throw outcome.reason;
      }
      errors.set(
        token.address,
        outcome.reason instanceof ZamaError
          ? outcome.reason
          : new DecryptionFailedError(toError(outcome.reason).message, { cause: outcome.reason }),
      );
    }
    return handles;
  }

  // WRITE OPERATIONS

  /**
   * Confidential transfer. Encrypts the amount via FHE, then calls the contract.
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
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link InsufficientConfidentialBalanceError} if the balance is less than `amount`.
   * @throws {@link BalanceCheckUnavailableError} if balance validation requires decryption that is not possible.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n);
   * ```
   */
  async confidentialTransfer(
    to: Address,
    amount: bigint,
    options?: TransferOptions,
  ): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("confidentialTransfer");
    const account = await requireAlignedWalletAccount(
      "confidentialTransfer",
      this.sdk.signer,
      this.sdk.provider,
    );
    const { skipBalanceCheck = false, onEncryptComplete, onTransferSubmitted } = options ?? {};

    const normalizedTo = getAddress(to);

    if (!skipBalanceCheck) {
      await this.assertConfidentialBalance(amount);
    }

    const { handles, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress: getAddress(account.address),
    });
    void swallow("transfer: onEncryptComplete", () => onEncryptComplete?.());

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await signer.writeContract(
        confidentialTransferContract(this.address, normalizedTo, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash });
      void swallow("transfer: onTransferSubmitted", () => onTransferSubmitted?.(txHash));
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
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
    const signer = this.sdk.requireSigner("confidentialTransferFrom");
    await requireAlignedWalletAccount(
      "confidentialTransferFrom",
      this.sdk.signer,
      this.sdk.provider,
    );
    const normalizedFrom = getAddress(from);
    const normalizedTo = getAddress(to);

    const { handles, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress: normalizedFrom,
    });
    void swallow("transferFrom: onEncryptComplete", () => callbacks?.onEncryptComplete?.());

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await signer.writeContract(
        confidentialTransferFromContract(
          this.address,
          normalizedFrom,
          normalizedTo,
          handles[0]!,
          inputProof,
        ),
      );
      this.emit({ type: ZamaSDKEvents.TransferFromSubmitted, txHash });
      void swallow("transferFrom: onTransferSubmitted", () =>
        callbacks?.onTransferSubmitted?.(txHash),
      );
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
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

  // OPERATOR APPROVAL

  /**
   * Set operator approval for the confidential token.
   * Defaults to 1 hour from now if `until` is not specified.
   *
   * @param operator - The address to set as an operator.
   * @param until - Optional Unix timestamp for approval expiry. Defaults to now + 1 hour.
   * @returns The transaction hash and mined receipt.
   *
   * @example
   * ```ts
   * const txHash = await token.setOperator("0xOperator");
   * ```
   */
  async setOperator(operator: Address, until?: number): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("setOperator");
    await requireChainAlignment("setOperator", this.sdk.signer, this.sdk.provider);
    const normalizedOperator = getAddress(operator);
    try {
      const txHash = await signer.writeContract(
        setOperatorContract(this.address, normalizedOperator, until),
      );
      this.emit({ type: ZamaSDKEvents.SetOperatorSubmitted, txHash });
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "setOperator",
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
   * @param holder - The token holder address.
   * @param spender - The address to check operator approval for.
   * @returns `true` if the spender is an approved operator for the holder.
   *
   * @example
   * ```ts
   * if (await token.isOperator("0xHolder", "0xSpender")) {
   *   // spender can call transferFrom on behalf of holder
   * }
   * ```
   */
  async isOperator(holder: Address, spender: Address): Promise<boolean> {
    return this.sdk.provider.readContract(
      isOperatorContract(this.address, getAddress(holder), getAddress(spender)),
    );
  }

  // PROTECTED HELPERS (also used by WrappedToken subclass)

  /**
   * Read the on-chain encrypted balance handle for a given owner.
   *
   * @internal
   */
  protected async readConfidentialBalanceOf(owner: Address): Promise<Handle> {
    return await this.sdk.provider.readContract(confidentialBalanceOfContract(this.address, owner));
  }

  /**
   * Pre-flight check: decrypt the confidential balance and compare against the
   * requested amount. If credentials are cached the decrypt happens silently;
   * if not, throws {@link BalanceCheckUnavailableError} instead of triggering
   * a surprise EIP-712 popup.
   *
   * @internal
   */
  protected async assertConfidentialBalance(amount: bigint): Promise<void> {
    if (amount === 0n) {
      return;
    }

    let balance: bigint;
    try {
      const account = await requireAlignedWalletAccount(
        "assertConfidentialBalance",
        this.sdk.signer,
        this.sdk.provider,
      );
      balance = await this.balanceOf(getAddress(account.address));
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new BalanceCheckUnavailableError(`Balance validation failed (token: ${this.address})`, {
        cause: error,
      });
    }

    if (balance < amount) {
      throw new InsufficientConfidentialBalanceError(
        `Insufficient confidential balance: requested ${amount}, available ${balance} (token: ${this.address})`,
        { requested: amount, available: balance, token: this.address },
      );
    }
  }

  /**
   * Emit a token-scoped event through the owning {@link ZamaSDK} so that
   * subscribers see a unified stream.
   *
   * @internal
   */
  protected emit(input: ZamaSDKEventInput): void {
    this.sdk.emitEvent(input, this.address);
  }

  /** Verify all tokens share the same SDK instance and return it. */
  private static assertSameSdk(tokens: Token[]): ZamaSDK {
    const sdk = tokens[0]!.sdk;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i]!.sdk !== sdk) {
        throw new ConfigurationError(
          "All tokens in a batch operation must share the same ZamaSDK instance",
        );
      }
    }
    return sdk;
  }
}

/**
 * Re-exported alias used by tests and helpers for arbitrary-handle decryption.
 * Use {@link ZamaSDK.userDecrypt} directly in application code.
 *
 * @internal
 */
export type DecryptedHandlesMap = Map<Handle, ClearValueType>;
