import { type Address, getAddress } from "viem";
import {
  allowanceContract,
  confidentialBalanceOfContract,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID_LEGACY,
  nameContract,
  supportsInterfaceContract,
  symbolContract,
  underlyingContract,
} from "../contracts";
import { ConfigurationError, DecryptionFailedError, isFatalBatchError, ZamaError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { isZeroHandle, ZERO_HANDLE } from "../utils/handles";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";
import { assertBigint } from "../utils/assertions";
import { pLimit } from "../utils/concurrency";
import type { ZamaSDK } from "../zama-sdk";

// Re-exported so consumers importing via `./token` keep a single canonical
// reference. The constant itself lives in `utils/handles`.
export { ZERO_HANDLE, isZeroHandle };

/** Options for {@link ReadonlyToken.batchDecryptBalancesAs}. */
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

/** Result of {@link ReadonlyToken.batchBalancesOf}. */
export interface BatchBalancesResult {
  /** Successfully decrypted balances, keyed by token address. */
  results: Map<Address, bigint>;
  /** Per-token errors for tokens that failed to decrypt. */
  errors: Map<Address, ZamaError>;
}

/**
 * Read-only interface for a confidential token.
 * Supports balance queries, authorization, and ERC-165 checks.
 * Does not require a wrapper address.
 *
 * Decryption, credentials, caching, and event emission are handled by the
 * owning {@link ZamaSDK} — this class only exposes token-specific helpers
 * that delegate to {@link ZamaSDK.userDecrypt} and {@link ZamaSDK.allow}.
 */
export class ReadonlyToken {
  readonly sdk: ZamaSDK;
  readonly address: Address;

  constructor(sdk: ZamaSDK, address: Address) {
    this.sdk = sdk;
    this.address = getAddress(address);
  }

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
    // During the transition period, check both wrapper interface IDs in parallel.
    // Either returning true is sufficient to identify a confidential wrapper.
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

  /**
   * Decrypt confidential balances for multiple tokens in parallel, returning
   * successes and per-token errors separately. Pre-authorizes all token
   * addresses in a single wallet signature, then delegates each decrypt to
   * {@link ZamaSDK.userDecrypt}.
   *
   * Tokens that fail to decrypt land in `errors` rather than aborting the
   * whole batch — caller decides how to surface them.
   *
   * @param tokens - Array of {@link ReadonlyToken} instances bound to the same SDK.
   * @param owner - Balance owner address.
   * @returns `{ results, errors }` partitioning the per-token outcomes.
   *
   * @example
   * ```ts
   * const { results, errors } = await ReadonlyToken.batchBalancesOf(tokens, owner);
   * ```
   */
  static async batchBalancesOf(
    tokens: ReadonlyToken[],
    owner: Address,
  ): Promise<BatchBalancesResult> {
    const results = new Map<Address, bigint>();
    const errors = new Map<Address, ZamaError>();
    if (tokens.length === 0) {
      return { results, errors };
    }

    const sdk = ReadonlyToken.assertSameSdk(tokens);
    // Fail fast on chain mismatch before prompting the wallet for a signature.
    await sdk.requireChainAlignment("batchBalancesOf");
    // Pre-authorize the full token set in one wallet signature so subsequent
    // per-token userDecrypt calls reuse the cached credentials.
    await sdk.allow(tokens.map((t) => t.address));

    // Bound concurrency so a large token list can't overwhelm the relayer.
    // Default matches the inner userDecrypt limit.
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
        // Systemic failures (user rejected signature, SDK misconfigured)
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
   * `DecryptionFailedError` with the first error as `cause`.
   * When the relayer returns no value for a handle,
   * a `DecryptionFailedError` is thrown for that token (never silently returns `0n`).
   * Pass `onError: () => 0n` to opt into the silent zero behavior.
   *
   * @param tokens - Array of ReadonlyToken instances to decrypt balances for.
   * @param options - Delegated decryption configuration.
   * @returns A Map from token address to decrypted balance.
   * @throws {@link DelegationNotFoundError} if no active delegation exists from the delegator to the connected signer.
   * @throws {@link DelegationExpiredError} if the delegation has expired.
   * @throws {@link DecryptionFailedError} if any decryption fails and no `onError` callback is provided.
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   *
   * @example
   * ```ts
   * const balances = await ReadonlyToken.batchDecryptBalancesAs(tokens, {
   *   delegatorAddress: "0xDelegator",
   *   onError: (err, addr) => { console.error(addr, err); return 0n; },
   * });
   * ```
   */
  static async batchDecryptBalancesAs(
    tokens: ReadonlyToken[],
    options: BatchDecryptAsOptions,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) {
      return new Map();
    }

    const sdk = ReadonlyToken.assertSameSdk(tokens);
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
      (await ReadonlyToken.readBalanceHandlesBatch(
        tokens,
        normalizedAccount,
        errors,
        maxConcurrency,
      ));

    const decryptRequests: Array<{ token: ReadonlyToken; handle: Handle }> = [];
    for (const [index, token] of tokens.entries()) {
      const handle = resolvedHandles[index];
      if (handle && !errors.has(token.address)) {
        decryptRequests.push({ token, handle });
      }
    }

    const decrypted = await sdk.delegatedBatchDecryptHandlesAs({
      handles: decryptRequests.map(({ token, handle }) => ({
        handle,
        contractAddress: token.address,
      })),
      delegatorAddress: options.delegatorAddress,
      accountAddress: options.accountAddress,
      maxConcurrency: options.maxConcurrency,
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

    if (errors.size === 0) {
      return results;
    }

    if (options.onError) {
      for (const [address, error] of errors) {
        try {
          results.set(address, options.onError(error, address));
        } catch (callbackError) {
          throw toError(callbackError);
        }
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

  /**
   * Read the underlying ERC-20 address from this token's wrapper contract.
   *
   * @returns The underlying ERC-20 token address.
   */
  async underlyingToken(): Promise<Address> {
    return this.sdk.provider.readContract(underlyingContract(this.address));
  }

  /**
   * Read the ERC-20 allowance of the underlying token for a given wrapper.
   *
   * @param wrapper - The wrapper contract address to check allowance for.
   * @param owner - The owner address whose allowance to read.
   * @returns The current allowance as a bigint.
   */
  async allowance(wrapper: Address, owner: Address): Promise<bigint> {
    const normalizedWrapper = getAddress(wrapper);
    const underlying = await this.sdk.provider.readContract(underlyingContract(normalizedWrapper));
    return this.sdk.provider.readContract(
      allowanceContract(underlying, getAddress(owner), normalizedWrapper),
    );
  }

  /**
   * Read the token name from the contract.
   *
   * @returns The token name string.
   */
  async name(): Promise<string> {
    return this.sdk.provider.readContract(nameContract(this.address));
  }

  /**
   * Read the token symbol from the contract.
   *
   * @returns The token symbol string.
   */
  async symbol(): Promise<string> {
    return this.sdk.provider.readContract(symbolContract(this.address));
  }

  /**
   * Read the token decimals from the contract.
   *
   * @returns The number of decimals.
   */
  async decimals(): Promise<number> {
    return this.sdk.provider.readContract(decimalsContract(this.address));
  }

  /**
   * Ensure FHE decrypt credentials exist for this token.
   * Generates a keypair and requests an EIP-712 signature if needed.
   * Call this before any decrypt operation to avoid mid-flow wallet prompts.
   *
   * @returns Resolves when credentials are cached.
   *
   * @example
   * ```ts
   * await token.allow();
   * // Credentials are now cached — subsequent decrypts won't prompt
   * const balance = await token.balanceOf(owner);
   * ```
   */
  async allow(): Promise<void> {
    await this.sdk.allow([this.address]);
  }

  /**
   * Whether a permit covering this token is currently cached for the connected wallet.
   * Use this to check if decrypt operations can proceed without a wallet prompt.
   *
   * @returns `true` if a stored permit covers this token's contract for the connected signer.
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   */
  async isAllowed(): Promise<boolean> {
    return this.sdk.isAllowed([this.address]);
  }

  /**
   * Revoke the stored permit covering this token by removing its address
   * from every direct-decrypt permission for the current signer/chain. The
   * keypair survives.
   *
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   */
  async revoke(): Promise<void> {
    await this.sdk.revokePermits([this.address]);
  }

  /**
   * Ensure FHE decrypt credentials exist for all given tokens in a single
   * wallet signature. Call this early (e.g. after loading the token list) so
   * that subsequent individual decrypt operations reuse cached credentials.
   *
   * @param tokens - Array of ReadonlyToken instances to allow.
   * @returns Resolves when all credentials are cached.
   *
   * @example
   * ```ts
   * const tokens = addresses.map(a => sdk.createReadonlyToken(a));
   * await ReadonlyToken.allow(...tokens);
   * // All tokens now share the same credentials
   * ```
   */
  static async allow(...tokens: ReadonlyToken[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    const sdk = ReadonlyToken.assertSameSdk(tokens);
    await sdk.allow(tokens.map((t) => t.address));
  }

  protected async getAclAddress(): Promise<Address> {
    return this.sdk.relayer.getAclAddress();
  }

  /**
   * Check whether a delegation is active for this token's contract address.
   *
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns `true` if the delegation exists and has not expired.
   */
  async isDelegated(params: {
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<boolean> {
    return this.sdk.isDelegated({ ...params, contractAddress: this.address });
  }

  /**
   * Get the expiration timestamp of a delegation for this token.
   *
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns Unix timestamp as bigint. `0n` = no delegation. `2^64 - 1` = permanent.
   */
  async getDelegationExpiry({
    delegatorAddress,
    delegateAddress,
  }: {
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<bigint> {
    return this.sdk.getDelegationExpiry({
      contractAddress: this.address,
      delegatorAddress,
      delegateAddress,
    });
  }

  protected async readConfidentialBalanceOf(owner: Address): Promise<Handle> {
    return await this.sdk.provider.readContract(confidentialBalanceOfContract(this.address, owner));
  }
  /**
   * Decrypt the balance of a delegator using delegated decryption credentials.
   * The connected signer acts as the delegatee who has been granted permission
   * by the delegator to decrypt their balance.
   *
   * Decrypted values are cached in storage keyed by
   * `(account, token, handle)`. Because every on-chain balance change
   * produces a new encrypted handle, stale cache entries are never served.
   * Cache write failures are silently ignored — they do not affect the returned value.
   *
   * @param delegatorAddress - The address of the account that delegated decryption rights.
   * @param account - The account whose on-chain balance to read (matches
   *   `confidentialBalanceOf(account)` on-chain). Defaults to the delegator
   *   address (the common case where the delegator grants permission to
   *   decrypt their own balance).
   * @returns The decrypted plaintext balance as a bigint.
   * @throws {@link DelegationNotFoundError} if no active delegation exists from the delegator to the connected signer.
   * @throws {@link DelegationExpiredError} if the delegation has expired.
   * @throws {@link DecryptionFailedError} if delegated decryption fails or the relayer returns no value.
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
    await this.sdk.requireChainAlignment("decryptBalanceAs");
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

  /**
   * Emit a decrypt-related event scoped to this token. Events are routed
   * through the owning {@link ZamaSDK} so subscribers see a unified stream.
   */
  protected emit(input: ZamaSDKEventInput): void {
    this.sdk.emitEvent(input, this.address);
  }

  /** Verify all tokens share the same SDK instance and return it. */
  private static assertSameSdk(tokens: ReadonlyToken[]): ZamaSDK {
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

  private static async readBalanceHandlesBatch(
    tokens: ReadonlyToken[],
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
      errors.set(token.address, ReadonlyToken.toBatchDecryptionError(outcome.reason));
    }
    return handles;
  }

  private static toBatchDecryptionError(reason: unknown): ZamaError {
    return reason instanceof ZamaError
      ? reason
      : new DecryptionFailedError(toError(reason).message, {
          cause: reason,
        });
  }
}

/**
 * Re-exported alias used by tests and helpers for arbitrary-handle decryption.
 * Use {@link ZamaSDK.userDecrypt} directly in application code.
 *
 * @internal
 */
export type DecryptedHandlesMap = Map<Handle, ClearValueType>;
