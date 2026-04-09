import { type Address, getAddress } from "viem";
import { DecryptCache } from "../decrypt-cache";
import {
  allowanceContract,
  confidentialBalanceOfContract,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  getDelegationExpiryContract,
  MAX_UINT64,
  nameContract,
  supportsInterfaceContract,
  symbolContract,
  underlyingContract,
} from "../contracts";
import { CredentialsManager } from "../credentials/credentials-manager";
import { DelegatedCredentialsManager } from "../credentials/delegated-credentials-manager";
import {
  ConfigurationError,
  DecryptionFailedError,
  DelegationExpiredError,
  DelegationNotFoundError,
  DelegationNotPropagatedError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningFailedError,
  SigningRejectedError,
} from "../errors";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner, GenericStorage } from "../types";
import { toError } from "../utils";
import { assertBigint } from "../utils/assertions";
import { pLimit } from "./concurrency";

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Options for {@link ReadonlyToken.batchDecryptBalances}. */
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

/** Options for {@link ReadonlyToken.batchDecryptBalancesAs}. */
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

/** Configuration for constructing a {@link ReadonlyToken}. */
export interface ReadonlyTokenConfig {
  /** Address of the confidential token contract. */
  address: Address;
  /** FHE relayer backend. */
  relayer: RelayerSDK;
  /** Wallet signer for read calls and credential signing. */
  signer: GenericSigner;
  /** Credential storage backend. */
  storage: GenericStorage;
  /** Session storage for wallet signatures. Shared across all contracts in the same SDK instance. */
  sessionStorage: GenericStorage;
  /** Storage-backed cache for decrypted handle values. When omitted, a private instance is created. */
  cache?: DecryptCache;
  /** Shared CredentialsManager instance. When provided, storage/sessionStorage/keypairTTL/onEvent are ignored for credential creation. */
  credentials?: CredentialsManager;
  /** Shared DelegatedCredentialsManager instance. When provided, storage/sessionStorage/keypairTTL/onEvent are ignored for delegated credential creation. */
  delegatedCredentials?: DelegatedCredentialsManager;
  /** How long the re-encryption keypair remains valid, in seconds. Default: `86400` (1 day). */
  keypairTTL?: number;
  /** Controls session signature lifetime in seconds. Default: `2592000` (30 days). `0` means every operation triggers a signing prompt. `"infinite"` means the session never expires. */
  sessionTTL?: number | "infinite";
  /** Optional structured event listener for debugging and telemetry. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * Read-only interface for a confidential token.
 * Supports balance queries, authorization, and ERC-165 checks.
 * Does not require a wrapper address.
 */
export class ReadonlyToken {
  protected readonly credentials: CredentialsManager;
  protected readonly delegatedCredentials: DelegatedCredentialsManager;
  protected readonly relayer: RelayerSDK;
  readonly signer: GenericSigner;
  readonly address: Address;
  readonly storage: GenericStorage;
  readonly cache: DecryptCache;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: ReadonlyTokenConfig) {
    const credentialsConfig = {
      relayer: config.relayer,
      signer: config.signer,
      storage: config.storage,
      sessionStorage: config.sessionStorage,
      keypairTTL: config.keypairTTL ?? 2592000,
      sessionTTL: config.sessionTTL ?? 2592000,
      onEvent: config.onEvent,
    };
    this.credentials = config.credentials ?? new CredentialsManager(credentialsConfig);
    this.delegatedCredentials =
      config.delegatedCredentials ?? new DelegatedCredentialsManager(credentialsConfig);
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.address = getAddress(config.address);
    this.storage = config.storage;
    this.cache = config.cache ?? new DecryptCache(config.storage);
    this.#onEvent = config.onEvent;
  }

  /** Emit a structured event (no-op when no listener is registered). */
  protected emit(partial: ZamaSDKEventInput): void {
    this.#onEvent?.({
      ...partial,
      tokenAddress: this.address,
      timestamp: Date.now(),
    });
  }

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
    const handle = await this.readConfidentialBalanceOf(ownerAddress);
    return this.decryptBalance(handle, ownerAddress);
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
    const ownerAddress = owner ? getAddress(owner) : await this.signer.getAddress();
    return this.readConfidentialBalanceOf(ownerAddress);
  }

  /**
   * ERC-165 check for {@link ERC7984_INTERFACE_ID} support.
   *
   * @returns `true` if the contract implements the ERC-7984 confidential token interface.
   *
   * @example
   * ```ts
   * if (await token.isConfidential()) {
   *   // Token supports encrypted operations
   * }
   * ```
   */
  async isConfidential(): Promise<boolean> {
    const result = await this.signer.readContract(
      supportsInterfaceContract(this.address, ERC7984_INTERFACE_ID),
    );
    return result;
  }

  /**
   * ERC-165 check for {@link ERC7984_WRAPPER_INTERFACE_ID} support.
   *
   * @returns `true` if the contract implements the ERC-7984 wrapper interface.
   *
   * @example
   * ```ts
   * if (await token.isWrapper()) {
   *   // Token is a confidential wrapper
   * }
   * ```
   */
  async isWrapper(): Promise<boolean> {
    const result = await this.signer.readContract(
      supportsInterfaceContract(this.address, ERC7984_WRAPPER_INTERFACE_ID),
    );
    return result;
  }

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
   * @param tokens - Array of ReadonlyToken instances to decrypt balances for.
   * @param options - Optional configuration for handles, owner, error handling, and concurrency.
   * @returns A Map from token address to decrypted balance.
   * @throws {@link DecryptionFailedError} if any decryption fails and no `onError` callback is provided.
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   *
   * @example
   * ```ts
   * // Simple one-shot:
   * const balances = await ReadonlyToken.batchDecryptBalances(tokens);
   *
   * // With pre-fetched handles and error callback:
   * const handles = await Promise.all(tokens.map(t => t.confidentialBalanceOf()));
   * const balances = await ReadonlyToken.batchDecryptBalances(tokens, {
   *   handles,
   *   onError: (err, addr) => { console.error(addr, err); return 0n; },
   * });
   * ```
   */
  static async batchDecryptBalances(
    tokens: ReadonlyToken[],
    options?: BatchDecryptOptions,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) {
      return new Map();
    }

    const { handles, owner, onError, maxConcurrency } = options ?? {};
    const firstToken = tokens[0]!;
    const sdk = ReadonlyToken.assertSameRelayer(tokens);
    const signerAddress = owner ?? (await firstToken.signer.getAddress());

    return ReadonlyToken.#batchDecryptCore({
      tokens,
      handles,
      ownerAddress: signerAddress,
      onError,
      maxConcurrency,
      obtainCreds: (uncachedAddresses) => firstToken.credentials.allow(uncachedAddresses),
      decrypt: (creds, handle, contractAddress) =>
        sdk.userDecrypt({
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

    const { delegatorAddress, handles, owner, onError, maxConcurrency } = options;
    const ownerAddress = owner ?? delegatorAddress;
    const firstToken = tokens[0]!;
    ReadonlyToken.assertSameRelayer(tokens);

    return ReadonlyToken.#batchDecryptCore({
      tokens,
      handles,
      ownerAddress,
      onError,
      maxConcurrency,
      preFlightCheck: () => firstToken.#assertDelegationActive(delegatorAddress),
      obtainCreds: (uncachedAddresses) =>
        firstToken.delegatedCredentials.allow(delegatorAddress, uncachedAddresses),
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
    tokens: ReadonlyToken[];
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
      handles ?? (await Promise.all(tokens.map((t) => t.readConfidentialBalanceOf(ownerAddress))));

    if (tokens.length !== resolvedHandles.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal handles.length (${resolvedHandles.length})`,
      );
    }

    const results = new Map<Address, bigint>();

    // Parallel cache lookups — avoids sequential IDB round-trips.
    const uncached: { token: ReadonlyToken; handle: Address }[] = [];
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

  /**
   * Read the underlying ERC-20 address from this token's wrapper contract.
   *
   * @returns The underlying ERC-20 token address.
   *
   * @example
   * ```ts
   * const underlying = await token.underlyingToken();
   * ```
   */
  async underlyingToken(): Promise<Address> {
    return this.signer.readContract(underlyingContract(this.address));
  }

  /**
   * Read the ERC-20 allowance of the underlying token for a given wrapper.
   *
   * @param wrapper - The wrapper contract address to check allowance for.
   * @param owner - Optional owner address. Defaults to the connected signer.
   * @returns The current allowance as a bigint.
   *
   * @example
   * ```ts
   * const allowance = await token.allowance("0xWrapper");
   * ```
   */
  async allowance(wrapper: Address, owner?: Address): Promise<bigint> {
    const normalizedWrapper = getAddress(wrapper);
    const underlying = await this.signer.readContract(underlyingContract(normalizedWrapper));
    const userAddress = owner ? getAddress(owner) : await this.signer.getAddress();
    return this.signer.readContract(allowanceContract(underlying, userAddress, normalizedWrapper));
  }

  /**
   * Read the token name from the contract.
   *
   * @returns The token name string.
   *
   * @example
   * ```ts
   * const name = await token.name(); // "Wrapped USDC"
   * ```
   */
  async name(): Promise<string> {
    return this.signer.readContract(nameContract(this.address));
  }

  /**
   * Read the token symbol from the contract.
   *
   * @returns The token symbol string.
   *
   * @example
   * ```ts
   * const symbol = await token.symbol(); // "cUSDC"
   * ```
   */
  async symbol(): Promise<string> {
    return this.signer.readContract(symbolContract(this.address));
  }

  /**
   * Read the token decimals from the contract.
   *
   * @returns The number of decimals.
   *
   * @example
   * ```ts
   * const decimals = await token.decimals(); // 6
   * ```
   */
  async decimals(): Promise<number> {
    return this.signer.readContract(decimalsContract(this.address));
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
    await this.credentials.allow([this.address]);
  }

  /**
   * Whether a session signature is currently cached for the connected wallet.
   * Use this to check if decrypt operations can proceed without a wallet prompt.
   */
  async isAllowed(): Promise<boolean> {
    return this.credentials.isAllowed([this.address]);
  }

  /**
   * Revoke the session signature for the connected wallet.
   * Stored credentials remain intact, but the next decrypt operation
   * will require a fresh wallet signature.
   */
  async revoke(contractAddresses: Address[] = []): Promise<void> {
    await this.credentials.revoke(contractAddresses);
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
    const allAddresses = tokens.map((t) => t.address);
    await tokens[0]!.credentials.allow(allAddresses);
  }

  protected async getAclAddress(): Promise<Address> {
    return this.relayer.getAclAddress();
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
    const now = await this.signer.getBlockTimestamp();
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
    return this.signer.readContract(
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

  protected async readConfidentialBalanceOf(owner: Address): Promise<Handle> {
    return (await this.signer.readContract(
      confidentialBalanceOfContract(this.address, owner),
    )) as Handle;
  }

  isZeroHandle(handle: string): handle is typeof ZERO_HANDLE | `0x` {
    return handle === ZERO_HANDLE || handle === "0x";
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

    const handle = await this.readConfidentialBalanceOf(normalizedOwner);
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

      const creds = await this.delegatedCredentials.allow(normalizedDelegator, [this.address]);

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

    const creds = await this.credentials.allow([this.address]);

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
      await this.cache.set(signerAddress, this.address, handle, value);
      assertBigint(value, "decryptBalance: result[handle]");
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
   * Batch-decrypt arbitrary encrypted handles in a single relayer call.
   * Zero handles are returned as 0n without hitting the relayer.
   *
   * @param handles - Array of encrypted handles to decrypt.
   * @param owner - Optional owner address for the decrypt request.
   * @returns A Map from handle to decrypted bigint value.
   * @throws {@link DecryptionFailedError} if FHE decryption fails.
   */
  async decryptHandles(handles: Handle[], owner?: Address): Promise<Map<Handle, ClearValueType>> {
    const results = new Map<Handle, ClearValueType>();
    const nonZeroHandles: Handle[] = [];

    for (const handle of handles) {
      if (this.isZeroHandle(handle)) {
        results.set(handle, 0n);
      } else {
        nonZeroHandles.push(handle);
      }
    }

    if (nonZeroHandles.length === 0) {
      return results;
    }

    const creds = await this.credentials.allow([this.address]);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const decrypted = await this.relayer.userDecrypt({
        handles: nonZeroHandles,
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress: owner ?? (await this.signer.getAddress()),
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });

      for (const handle of nonZeroHandles) {
        const value = decrypted[handle];
        if (value === undefined) {
          throw new DecryptionFailedError(`Decryption returned no value for handle ${handle}`);
        }
        results.set(handle, value);
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

  /** Verify all tokens share the same relayer and return it. */
  private static assertSameRelayer(tokens: ReadonlyToken[]): RelayerSDK {
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
}

/**
 * Inspect a caught error for an HTTP status code and return the appropriate
 * typed SDK error (NoCiphertextError for 400, RelayerRequestFailedError for
 * other HTTP errors, or the generic DecryptionFailedError as fallback).
 *
 * When `isDelegated` is true and the relayer returns a 500, the error is
 * wrapped as {@link DelegationNotPropagatedError} because the most likely
 * cause is that the gateway hasn't synced the delegation from L1 yet.
 */
function wrapDecryptError(error: unknown, fallbackMessage: string, isDelegated = false): Error {
  if (
    error instanceof DecryptionFailedError ||
    error instanceof NoCiphertextError ||
    error instanceof RelayerRequestFailedError ||
    error instanceof DelegationNotPropagatedError ||
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError
  ) {
    return error;
  }

  const statusCode =
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
      ? ((error as Record<string, unknown>).statusCode as number)
      : undefined;

  if (statusCode === 400) {
    return new NoCiphertextError(
      error instanceof Error ? error.message : "No ciphertext for this account",
      { cause: error },
    );
  }

  if (isDelegated && statusCode === 500) {
    return new DelegationNotPropagatedError(
      "Delegated decryption failed with a server error. " +
        "This is most commonly caused by the delegation not having propagated to the gateway yet — " +
        "after granting delegation, allow 1–2 minutes for cross-chain synchronization before retrying. " +
        "If the error persists, the gateway or relayer may be experiencing an unrelated issue.",
      { cause: error },
    );
  }

  if (statusCode !== undefined) {
    return new RelayerRequestFailedError(
      error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      { cause: error },
    );
  }

  return new DecryptionFailedError(fallbackMessage, {
    cause: error,
  });
}
