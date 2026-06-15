import { type Address, getAddress, type Hex } from "viem";
import {
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  isOperatorContract,
  nameContract,
  setOperatorContract,
  supportsInterfaceContract,
  symbolContract,
} from "../contracts";
import {
  BalanceCheckUnavailableError,
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
  InsufficientConfidentialBalanceError,
  isFatalBatchError,
  requireConfigured,
  ZamaError,
} from "../errors";
import type { TransactionOperation, ZamaSDKEventInput } from "../events/sdk-events";
import type { ClearValue, EncryptedValue } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertBigint } from "../utils/assertions";
import { pLimit } from "../utils/concurrency";
import { isEncryptedValueZero } from "../utils/handles";
import { submitTransaction as submitSdkTransaction } from "../utils/submit-transaction";
import { swallow } from "../utils/swallow";
import type {
  GenericSigner,
  TransactionResult,
  TransferCallbacks,
  TransferOptions,
  WriteContractConfig,
} from "../types";
import type { ZamaSDK } from "../zama-sdk";

/** Options for {@link Token.batchDecryptBalancesAs}. */
export interface BatchDecryptAsOptions {
  /** The address of the account that delegated decryption rights. */
  delegatorAddress: Address;
  /** Pre-fetched encrypted values. When omitted, they are fetched from the chain. */
  encryptedValues?: EncryptedValue[];
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
 * that delegate to `sdk.decryption.decryptValues` and `sdk.permits.grantPermit`.
 */
export class Token {
  readonly sdk: ZamaSDK;
  readonly address: Address;

  constructor(sdk: ZamaSDK, address: Address) {
    this.sdk = sdk;
    this.address = getAddress(address);
  }

  /** Resolve `sdk.signer` or throw {@link SignerNotConfiguredError} tagged with `operation`. */
  #requireSigner(operation: string): GenericSigner {
    return requireConfigured(this.sdk.signer, operation);
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
   * @returns `true` if the contract implements the ERC-7984 wrapper interface
   *   ({@link ERC7984_WRAPPER_INTERFACE_ID}, `0x1f1c62b2`).
   */
  async isWrapper(): Promise<boolean> {
    return this.sdk.provider.readContract(
      supportsInterfaceContract(this.address, ERC7984_WRAPPER_INTERFACE_ID),
    );
  }

  // BALANCES

  /**
   * Decrypt and return the plaintext balance for the given owner.
   * Acquires FHE credentials via a wallet signature if none are cached.
   *
   * @param owner - Balance owner address.
   * @returns The decrypted plaintext balance as a bigint.
   * @throws if FHE decryption fails. {@link DecryptionFailedError}
   *
   * @example
   * ```ts
   * const balance = await token.balanceOf("0xOwner");
   * ```
   */
  async balanceOf(owner: Address): Promise<bigint> {
    const ownerAddress = getAddress(owner);
    const encryptedValue = await this.readConfidentialBalanceOf(ownerAddress);
    const result = await this.sdk.decryption.decryptValues([
      { encryptedValue, contractAddress: this.address },
    ]);
    const value = result[encryptedValue];
    if (value === undefined) {
      throw new DecryptionFailedError(`Decryption returned no value for ${encryptedValue}`);
    }
    assertBigint(value, "balanceOf: result[encryptedValue]");
    return value;
  }

  /**
   * Return the raw encrypted balance without decrypting.
   *
   * @param owner - Balance owner address.
   * @returns The encrypted balance as a hex string.
   *
   * @example
   * ```ts
   * const encryptedValue = await token.confidentialBalanceOf("0xOwner");
   * ```
   */
  async confidentialBalanceOf(owner: Address): Promise<EncryptedValue> {
    return this.readConfidentialBalanceOf(getAddress(owner));
  }

  /**
   * Decrypt the balance of a delegator using delegated decryption credentials.
   * The connected signer acts as the delegatee who has been granted permission
   * by the delegator to decrypt their balance.
   *
   * Clear values are cached in storage keyed by `(account, token, encryptedValue)`.
   * Because every on-chain balance change produces a new encrypted value,
   * stale cache entries are never served. Cache write failures are silently
   * ignored — they do not affect the returned value.
   *
   * @param delegatorAddress - The address of the account that delegated decryption rights.
   * @param accountAddress - The account whose on-chain balance to read. Defaults
   *   to the delegator address.
   * @returns The decrypted plaintext balance as a bigint.
   * @throws if no active delegation exists. {@link DelegationNotFoundError}
   * @throws if the delegation has expired. {@link DelegationExpiredError}
   * @throws if delegated decryption fails. {@link DecryptionFailedError}
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

    const encryptedValue = await this.readConfidentialBalanceOf(normalizedAccount);
    if (isEncryptedValueZero(encryptedValue)) {
      return 0n;
    }

    const result = await this.sdk.decryption.delegatedDecryptValues(
      [{ encryptedValue, contractAddress: this.address }],
      normalizedDelegator,
      normalizedAccount,
    );

    const value = result[encryptedValue];
    if (value === undefined) {
      throw new DecryptionFailedError(
        `Delegated decryption returned no value for ${encryptedValue}`,
      );
    }
    assertBigint(value, "decryptBalanceAs: result[encryptedValue]");
    return value;
  }

  // BATCH STATICS

  /**
   * Decrypt confidential balances for multiple tokens in parallel, returning
   * successes and per-token errors separately. Pre-authorizes all token
   * addresses in a single wallet signature, then delegates each decrypt to
   * `sdk.decryption.decryptValues`.
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
    // per-token decryptValues calls reuse the cached credentials.
    await sdk.permits.grantPermit(tokens.map((t) => t.address));

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
   * `DecryptionFailedError`. When the relayer returns no value for an encrypted value,
   * a `DecryptionFailedError` is thrown for that token (never silently returns `0n`).
   * Pass `onError: () => 0n` to opt into the silent zero behavior.
   *
   * @param tokens - Array of Token instances to decrypt balances for.
   * @param options - Delegated decryption configuration.
   * @returns A Map from token address to decrypted balance.
   * @throws if no active delegation exists. {@link DelegationNotFoundError}
   * @throws if the delegation has expired. {@link DelegationExpiredError}
   * @throws if any decryption fails and no `onError` is provided. {@link DecryptionFailedError}
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
    if (options.encryptedValues && tokens.length !== options.encryptedValues.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal encryptedValues.length (${options.encryptedValues.length})`,
      );
    }
    const resolvedEncryptedValues =
      options.encryptedValues ??
      (await Token.readBalanceHandlesBatch(tokens, normalizedAccount, errors, maxConcurrency));

    const decryptRequests: Array<{ token: Token; encryptedValue: EncryptedValue }> = [];
    for (const [index, token] of tokens.entries()) {
      const encryptedValue = resolvedEncryptedValues[index];
      if (!encryptedValue || errors.has(token.address)) {
        continue;
      }
      if (isEncryptedValueZero(encryptedValue)) {
        // Zero balance → skip the relayer; no decryption needed.
        results.set(token.address, 0n);
      } else {
        decryptRequests.push({ token, encryptedValue });
      }
    }

    if (decryptRequests.length > 0) {
      const decrypted = await sdk.decryption.delegatedBatchDecryptValues({
        encryptedInputs: decryptRequests.map(({ token, encryptedValue }) => ({
          encryptedValue,
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
              `Batch delegated decryption returned no value for ${item.encryptedValue} on token ${request.token.address}`,
            ),
          );
          continue;
        }
        assertBigint(value, "batchDecryptBalancesAs: result[encryptedValue]");
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
  ): Promise<Array<EncryptedValue | undefined>> {
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

    const encryptedValues: Array<EncryptedValue | undefined> = [];
    for (const [index, token] of tokens.entries()) {
      const outcome = outcomes[index];
      if (!outcome) {
        continue;
      }
      if (outcome.status === "fulfilled") {
        encryptedValues[index] = outcome.value;
        continue;
      }
      if (isFatalBatchError(outcome.reason)) {
        throw outcome.reason;
      }
      errors.set(
        token.address,
        outcome.reason instanceof ZamaError
          ? outcome.reason
          : new DecryptionFailedError(toError(outcome.reason).message, {
              cause: outcome.reason,
            }),
      );
    }
    return encryptedValues;
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
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   * @throws if FHE encryption fails. {@link EncryptionFailedError}
   * @throws if the on-chain transfer reverts. {@link TransactionRevertedError}
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
    this.#requireSigner("confidentialTransfer");
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

    const { encryptedValues, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress: getAddress(account.address),
    });
    void swallow("transfer: onEncryptComplete", () => onEncryptComplete?.());

    if (encryptedValues.length === 0) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    return this.submitTransaction({
      operation: "transfer",
      config: confidentialTransferContract(
        this.address,
        normalizedTo,
        encryptedValues[0]!,
        inputProof,
      ),
      onSubmitted: onTransferSubmitted,
    });
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
    this.#requireSigner("confidentialTransferFrom");
    await requireAlignedWalletAccount(
      "confidentialTransferFrom",
      this.sdk.signer,
      this.sdk.provider,
    );
    const normalizedFrom = getAddress(from);
    const normalizedTo = getAddress(to);

    const { encryptedValues, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress: normalizedFrom,
    });
    void swallow("transferFrom: onEncryptComplete", () => callbacks?.onEncryptComplete?.());

    if (encryptedValues.length === 0) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    return this.submitTransaction({
      operation: "transferFrom",
      config: confidentialTransferFromContract(
        this.address,
        normalizedFrom,
        normalizedTo,
        encryptedValues[0]!,
        inputProof,
      ),
      onSubmitted: callbacks?.onTransferSubmitted,
    });
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
    this.#requireSigner("setOperator");
    await requireChainAlignment("setOperator", this.sdk.signer, this.sdk.provider);
    const normalizedOperator = getAddress(operator);
    return this.submitTransaction({
      operation: "setOperator",
      config: setOperatorContract(this.address, normalizedOperator, until),
    });
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

  // PROTECTED HELPERS

  /**
   * Read the on-chain encrypted balance for a given owner.
   *
   * @internal
   */
  protected async readConfidentialBalanceOf(owner: Address): Promise<EncryptedValue> {
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

  /**
   * Submit a token-scoped write transaction through the shared SDK transaction
   * pipeline. Callers keep pre-flight and operation-specific work local.
   *
   * @internal
   */
  protected async submitTransaction(params: {
    operation: TransactionOperation;
    config: WriteContractConfig;
    onSubmitted?: (txHash: Hex) => void;
  }): Promise<TransactionResult> {
    const { operation, config, onSubmitted } = params;
    return submitSdkTransaction({
      operation,
      signer: this.#requireSigner(operation),
      provider: this.sdk.provider,
      config,
      emit: (input) => this.emit(input),
      onSubmitted,
    });
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

/** @internal */
export type DecryptedHandlesMap = Map<EncryptedValue, ClearValue>;
