import { type Address, getAddress } from "viem";
import {
  allowanceContract,
  confidentialBalanceOfContract,
  confidentialWrapperInterfaceContracts,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  getDelegationExpiryContract,
  MAX_UINT64,
  nameContract,
  supportsInterfaceContract,
  symbolContract,
  underlyingContract,
} from "../contracts";
import {
  ConfigurationError,
  DecryptionFailedError,
  DelegationExpiredError,
  DelegationNotFoundError,
  isSessionError,
  wrapDecryptError,
  ZamaError,
} from "../errors";
import { ZamaSDKEvents, type ZamaSDKEventInput } from "../events/sdk-events";
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
  /** Maximum number of concurrent decrypt calls. Default: Infinity. */
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
    const ownerAddress = owner ? getAddress(owner) : await this.sdk.signer.getAddress();
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
   * @param owner - Optional balance owner address. Defaults to the connected signer.
   * @returns The encrypted balance handle as a hex string.
   *
   * @example
   * ```ts
   * const handle = await token.confidentialBalanceOf();
   * ```
   */
  async confidentialBalanceOf(owner?: Address): Promise<Handle> {
    const ownerAddress = owner ? getAddress(owner) : await this.sdk.signer.getAddress();
    return this.readConfidentialBalanceOf(ownerAddress);
  }

  /**
   * ERC-165 check for {@link ERC7984_INTERFACE_ID} support.
   *
   * @returns `true` if the contract implements the ERC-7984 confidential token interface.
   */
  async isConfidential(): Promise<boolean> {
    return this.sdk.signer.readContract(
      supportsInterfaceContract(this.address, ERC7984_INTERFACE_ID),
    );
  }

  /**
   * ERC-165 check for IERC7984ERC20Wrapper support.
   *
   * During the transition period, checks the documented legacy ID (`0xd04584ba`)
   * and the upgraded ID (`0x1f1c62b2`), returning `true` if either deployment
   * line is detected.
   *
   * @returns `true` if the contract implements the ERC-7984 wrapper interface.
   */
  async isWrapper(): Promise<boolean> {
    const matches = await Promise.all(
      confidentialWrapperInterfaceContracts(this.address).map((contract) =>
        this.sdk.signer.readContract(contract),
      ),
    );
    return matches.some(Boolean);
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
   * @param owner - Optional balance owner address. Defaults to the connected signer.
   * @returns `{ results, errors }` partitioning the per-token outcomes.
   *
   * @example
   * ```ts
   * const { results, errors } = await ReadonlyToken.batchBalancesOf(tokens);
   * ```
   */
  static async batchBalancesOf(
    tokens: ReadonlyToken[],
    owner?: Address,
  ): Promise<BatchBalancesResult> {
    const results = new Map<Address, bigint>();
    const errors = new Map<Address, ZamaError>();
    if (tokens.length === 0) {
      return { results, errors };
    }

    const sdk = ReadonlyToken.assertSameSdk(tokens);
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
        // Session-level failures (user rejected signature, SDK misconfigured)
        // apply to every token — surface them instead of collecting per-token.
        if (isSessionError(reason)) {
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

    const { delegatorAddress, handles, accountAddress, onError, maxConcurrency } = options;
    const normalizedAccount = accountAddress
      ? getAddress(accountAddress)
      : getAddress(delegatorAddress);
    const firstToken = tokens[0]!;
    ReadonlyToken.assertSameSdk(tokens);

    const resolvedHandles =
      handles ??
      (await Promise.all(tokens.map((t) => t.readConfidentialBalanceOf(normalizedAccount))));

    if (tokens.length !== resolvedHandles.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal handles.length (${resolvedHandles.length})`,
      );
    }

    const results = new Map<Address, bigint>();

    // Parallel cache lookups — avoids sequential IDB round-trips.
    const uncached: { token: ReadonlyToken; handle: Handle }[] = [];
    const cachedValues = await Promise.all(
      tokens.map(async (token, i) => {
        const handle = resolvedHandles[i]!;
        if (isZeroHandle(handle)) {
          return 0n;
        }
        return firstToken.sdk.cache.get(normalizedAccount, token.address, handle);
      }),
    );

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const handle = resolvedHandles[i]!;
      const cached = cachedValues[i];

      if (cached !== null && cached !== undefined) {
        assertBigint(cached, "batchDecryptBalancesAs: cached");
        results.set(token.address, cached);
        continue;
      }

      uncached.push({ token, handle });
    }

    // All balances resolved from cache — no credentials needed.
    if (uncached.length === 0) {
      return results;
    }

    // Pre-flight delegation check runs after cache lookups — skips RPC overhead
    // when all balances are cached. Best-effort: checks the first token's
    // contract only (delegations are typically granted per-delegator, not per-token).
    await firstToken.#assertDelegationActive(delegatorAddress);

    const uncachedAddresses = uncached.map((entry) => entry.token.address);
    const creds = await firstToken.sdk.delegatedCredentials.allow(
      delegatorAddress,
      ...uncachedAddresses,
    );

    const errors: { address: Address; error: Error }[] = [];
    const decryptFns: (() => Promise<void>)[] = [];

    for (const { token, handle } of uncached) {
      decryptFns.push(() =>
        firstToken.sdk.relayer
          .delegatedUserDecrypt({
            handles: [handle],
            contractAddress: token.address,
            signedContractAddresses: creds.contractAddresses,
            privateKey: creds.privateKey,
            publicKey: creds.publicKey,
            signature: creds.signature,
            delegatorAddress: creds.delegatorAddress,
            delegateAddress: creds.delegateAddress,
            startTimestamp: creds.startTimestamp,
            durationDays: creds.durationDays,
          })
          .then(async (result) => {
            const value = result[handle];
            if (value === undefined) {
              throw new DecryptionFailedError(
                `Batch delegated decryption returned no value for handle ${handle} on token ${token.address}`,
              );
            }
            assertBigint(value, "batchDecryptBalancesAs: result[handle]");
            results.set(token.address, value);
            // Cache write is best-effort — log on failure so a broken cache
            // backend doesn't silently force re-decryption forever.
            firstToken.sdk.cache
              .set(normalizedAccount, token.address, handle, value)
              .catch((cacheErr: unknown) => {
                // oxlint-disable-next-line no-console
                console.warn("[zama-sdk] Failed to cache decrypted value:", cacheErr);
              });
          })
          .catch((error) => {
            // Session-level failures apply to every token — re-throw so the
            // whole batch aborts with the original typed error.
            if (isSessionError(error)) {
              throw error;
            }
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
      // Preserve the first original error as `cause` so callers can still
      // `instanceof`-check the underlying failure type.
      throw new DecryptionFailedError(
        `Batch delegated decryption failed for ${errors.length} token(s): ${message}`,
        { cause: errors[0]!.error },
      );
    }

    return results;
  }

  /**
   * Read the underlying ERC-20 address from this token's wrapper contract.
   *
   * @returns The underlying ERC-20 token address.
   */
  async underlyingToken(): Promise<Address> {
    return this.sdk.signer.readContract(underlyingContract(this.address));
  }

  /**
   * Read the ERC-20 allowance of the underlying token for a given wrapper.
   *
   * @param wrapper - The wrapper contract address to check allowance for.
   * @param owner - Optional owner address. Defaults to the connected signer.
   * @returns The current allowance as a bigint.
   */
  async allowance(wrapper: Address, owner?: Address): Promise<bigint> {
    const normalizedWrapper = getAddress(wrapper);
    const underlying = await this.sdk.signer.readContract(underlyingContract(normalizedWrapper));
    const userAddress = owner ? getAddress(owner) : await this.sdk.signer.getAddress();
    return this.sdk.signer.readContract(
      allowanceContract(underlying, userAddress, normalizedWrapper),
    );
  }

  /**
   * Read the token name from the contract.
   *
   * @returns The token name string.
   */
  async name(): Promise<string> {
    return this.sdk.signer.readContract(nameContract(this.address));
  }

  /**
   * Read the token symbol from the contract.
   *
   * @returns The token symbol string.
   */
  async symbol(): Promise<string> {
    return this.sdk.signer.readContract(symbolContract(this.address));
  }

  /**
   * Read the token decimals from the contract.
   *
   * @returns The number of decimals.
   */
  async decimals(): Promise<number> {
    return this.sdk.signer.readContract(decimalsContract(this.address));
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
   * const balance = await token.balanceOf();
   * ```
   */
  async allow(): Promise<void> {
    await this.sdk.allow([this.address]);
  }

  /**
   * Whether a session signature is currently cached for the connected wallet.
   * Use this to check if decrypt operations can proceed without a wallet prompt.
   */
  async isAllowed(): Promise<boolean> {
    return this.sdk.credentials.isAllowed([this.address]);
  }

  /**
   * Revoke cached session signatures for the given contract addresses, forcing
   * a fresh wallet signature on the next decrypt operation for those contracts.
   * Stored credentials remain intact; only the in-memory session signature is
   * cleared.
   *
   * @param contractAddresses - Contract addresses to revoke credentials for.
   */
  async revoke(...contractAddresses: Address[]): Promise<void> {
    await this.sdk.credentials.revoke(...contractAddresses);
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
    const expiry = await this.getDelegationExpiry(params);
    if (expiry === 0n) {
      return false;
    }
    // Permanent delegation (uint64 max) — skip the RPC round-trip for block timestamp.
    if (expiry === MAX_UINT64) {
      return true;
    }
    const now = await this.sdk.signer.getBlockTimestamp();
    return expiry > now;
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
    const acl = await this.getAclAddress();
    return this.sdk.signer.readContract(
      getDelegationExpiryContract(
        acl,
        getAddress(delegatorAddress),
        getAddress(delegateAddress),
        this.address,
      ),
    );
  }

  /**
   * Throws if there is no active delegation from `delegatorAddress` to the
   * connected signer for this token contract.
   */
  async #assertDelegationActive(delegatorAddress: Address): Promise<void> {
    const delegateAddress = await this.sdk.signer.getAddress();
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
      const now = await this.sdk.signer.getBlockTimestamp();
      if (expiry <= now) {
        throw new DelegationExpiredError(
          `Delegation from ${delegatorAddress} to ${delegateAddress} for ${this.address} has expired`,
        );
      }
    }
  }

  protected async readConfidentialBalanceOf(owner: Address): Promise<Handle> {
    return await this.sdk.signer.readContract(confidentialBalanceOfContract(this.address, owner));
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
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedAccount = accountAddress ? getAddress(accountAddress) : normalizedDelegator;

    const handle = await this.readConfidentialBalanceOf(normalizedAccount);
    if (isZeroHandle(handle)) {
      return 0n;
    }

    const cached = await this.sdk.cache.get(normalizedAccount, this.address, handle);
    if (cached !== null) {
      assertBigint(cached, "decryptBalanceAs: cached");
      return cached;
    }

    // Pre-flight delegation check — avoids wasting a wallet signature on an
    // expired or non-existent delegation.
    await this.#assertDelegationActive(normalizedDelegator);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart, handles: [handle] });

      const creds = await this.sdk.delegatedCredentials.allow(normalizedDelegator, this.address);

      const result = await this.sdk.relayer.delegatedUserDecrypt({
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

      // Validate the relayer response before emitting DecryptEnd so subscribers
      // never see a contradictory `Start → End → Error` sequence.
      const value = result[handle];
      if (value === undefined) {
        throw new DecryptionFailedError(
          `Delegated decryption returned no value for handle ${handle}`,
        );
      }
      assertBigint(value, "decryptBalanceAs: result[handle]");

      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
        handles: [handle],
        result,
      });

      await this.sdk.cache.set(normalizedAccount, this.address, handle, value);
      return value;
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
        handles: [handle],
      });
      throw wrapDecryptError(error, "Failed to decrypt delegated balance", true);
    }
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
}

/**
 * Re-exported alias used by tests and helpers for arbitrary-handle decryption.
 * Use {@link ZamaSDK.userDecrypt} directly in application code.
 *
 * @internal
 */
export type DecryptedHandlesMap = Map<Handle, ClearValueType>;
