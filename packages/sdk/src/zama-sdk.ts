import { getAddress, type Address } from "viem";
import type { FheChain } from "./chains/types";
import {
  CredentialService,
  KeypairTTLSchema,
  PermitDurationSchema,
  type CredentialServiceConfig,
} from "./credentials/credential-service";
import {
  resolveDelegatedDecryptPermit,
  resolveUserDecryptPermit,
} from "./credentials/decrypt-permit";
import { findRevokedDelegations } from "./credentials/delegation-check";
import { DecryptCache } from "./decrypt-cache";
import {
  ChainMismatchError,
  EncryptionFailedError,
  SignerRequiredError,
  wrapDecryptError,
  ZamaError,
} from "./errors";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventListener } from "./events/sdk-events";
import { ZamaSDKEvents } from "./events/sdk-events";
import type { DecryptHandle } from "./query/user-decrypt";
import { isZeroHandle } from "./utils/handles";
import type { RelayerDispatcher } from "./relayer/relayer-dispatcher";
import type {
  ClearValueType,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
} from "./relayer/relayer-sdk.types";
import { ReadonlyToken } from "./token/readonly-token";
import { Token } from "./token/token";
import type {
  GenericProvider,
  GenericSigner,
  GenericStorage,
  SignerIdentityChange,
  SignerIdentityListener,
} from "./types";
import { toError } from "./utils";
import { pLimit } from "./utils/concurrency";
import { WrappersRegistry } from "./wrappers-registry";

/** Run a best-effort cleanup step. Errors are logged, never thrown. */
async function swallow(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn(`[zama-sdk] ${label} failed:`, error);
  }
}

/** Configuration for {@link ZamaSDK}. */
export interface ZamaSDKConfig {
  /** FHE chain configurations. Registry addresses are extracted from each chain's `registryAddress`. */
  chains?: readonly FheChain[];
  /** FHE relayer backend (`RelayerWeb` for browser, `RelayerNode` for server). */
  relayer: RelayerDispatcher;
  /**
   * Read-only chain provider (`ViemProvider`, `EthersProvider`, `WagmiProvider`,
   * or custom {@link GenericProvider}). Used for every public chain read the
   * SDK issues.
   */
  provider: GenericProvider;
  /**
   * Optional wallet signer (`ViemSigner`, `EthersSigner`, `WagmiSigner`, or
   * custom {@link GenericSigner}). Signer-required operations throw
   * {@link SignerRequiredError} when invoked without a signer.
   */
  signer?: GenericSigner;
  /** Credential storage backend (`IndexedDBStorage` for browser, `MemoryStorage` for tests). */
  storage: GenericStorage;
  /**
   * How long the ML-KEM re-encryption keypair remains valid, in seconds.
   * Default: `2592000` (30 days). Must be a positive number — `0` is rejected
   * because the keypair is required to establish the relayer connection.
   * Maximum: `31536000` (365 days) — the fhevm contract rejects `durationDays > 365`.
   * Values above this maximum are automatically capped with a console warning.
   */
  keypairTTL?: number;
  /**
   * Permit lifetime in days. Default: 30. Implicitly bounded by the keypair TTL —
   * values above `keypairTTL / 86400` are clamped with a warning.
   */
  permitDuration?: number;
  /**
   * Optional dedicated storage for permits. Defaults to `storage`. Use this
   * to keep permits out of long-lived storage (e.g. IndexedDB → MemoryStorage)
   * for high-security flows.
   */
  permitStorage?: GenericStorage;
  /** Optional structured event listener for debugging and telemetry. Never receives sensitive data. */
  onEvent?: ZamaSDKEventListener;
  /**
   * How long cached registry results remain valid, in seconds.
   * Default: `86400` (24 hours).
   */
  registryTTL?: number;
  /**
   * Per-chain wrappers registry address overrides, merged on top of chain definitions.
   * Use for custom or local chains (e.g. Hardhat) where no default registry exists.
   */
  registryAddresses?: Record<number, Address>;
}

/**
 * ZamaSDK — composes a RelayerSDK with contract abstraction.
 * Provides signer, storage, and high-level confidential contract interface.
 */
export class ZamaSDK {
  readonly relayer: RelayerDispatcher;
  readonly provider: GenericProvider;
  readonly signer: GenericSigner | undefined;
  readonly storage: GenericStorage;
  /** Persistent cache for decrypted FHE plaintext values, scoped by (requester, contract, handle). */
  readonly cache: DecryptCache;
  /**
   * A {@link WrappersRegistry} instance auto-configured for the current chain.
   * Uses built-in defaults from chain configs, and the SDK's `registryTTL` if configured.
   */
  readonly registry: WrappersRegistry;
  readonly #registryTTL: number | undefined;
  readonly #onEvent: ZamaSDKEventListener;
  readonly #identityListeners = new Set<SignerIdentityListener>();
  readonly #credentialService: CredentialService | undefined;
  #unsubscribeSigner?: () => void;

  constructor(config: ZamaSDKConfig) {
    this.relayer = config.relayer;
    this.provider = config.provider;
    this.signer = config.signer;
    this.storage = config.storage;
    this.cache = new DecryptCache(config.storage);
    this.#onEvent = config.onEvent ?? function () {};
    // Chain definitions provide defaults; explicit registryAddresses override them.
    const registryAddresses: Record<number, Address> = {};
    for (const chain of config.chains ?? []) {
      if (chain.registryAddress) {
        registryAddresses[chain.id] = chain.registryAddress;
      }
    }
    Object.assign(registryAddresses, config.registryAddresses);
    this.registry = new WrappersRegistry({
      provider: this.provider,
      registryTTL: config.registryTTL,
      registryAddresses,
    });
    this.#registryTTL = config.registryTTL;
    // Validate numeric config early — before the signer check — so callers get a fast,
    // clear error even when constructing a read-only (no-signer) SDK instance.
    if (config.keypairTTL !== undefined) {
      KeypairTTLSchema.parse(config.keypairTTL);
    }
    if (config.permitDuration !== undefined) {
      PermitDurationSchema.parse(config.permitDuration);
    }
    if (config.signer) {
      const signer = config.signer;
      this.#credentialService = new CredentialService(
        buildCredentialServiceConfig(this.relayer, signer, {
          keypairTTL: config.keypairTTL,
          permitDuration: config.permitDuration,
          storage: this.storage,
          permitStorage: config.permitStorage,
          onEvent: this.#onEvent,
        }),
      );

      this.#unsubscribeSigner = signer.subscribe?.((change) => {
        void this.#handleIdentityChange(change);
      });

      // Eager init — best-effort, errors swallowed.
      void this.#credentialService.initialize();
    } else {
      this.#credentialService = undefined;
    }
  }

  /**
   * Return the configured signer or throw {@link SignerRequiredError}.
   *
   * @throws {@link SignerRequiredError} if no signer is configured.
   */
  requireSigner(operation: string): GenericSigner {
    if (!this.signer) {
      throw new SignerRequiredError(operation);
    }
    return this.signer;
  }

  #requireCredentialService(operation: string): CredentialService {
    if (!this.#credentialService) {
      throw new SignerRequiredError(operation);
    }
    return this.#credentialService;
  }

  /**
   * Subscribe to wallet identity transitions.
   *
   * @param listener - Called on each transition with a {@link SignerIdentityChange} carrying
   *   `previous` and `next` identity snapshots; either may be `undefined` for
   *   connect and disconnect transitions.
   * @returns An unsubscribe function; calling it removes the listener.
   */
  onIdentityChange(listener: SignerIdentityListener): () => void {
    this.#identityListeners.add(listener);
    return () => {
      this.#identityListeners.delete(listener);
    };
  }

  /**
   * Pre-flight chain coherence check for signer-required operations.
   *
   * Throws {@link ChainMismatchError} if they differ.
   *
   * @param operation - The operation name, included in the error message.
   * @returns The chain ID shared by both signer and provider.
   * @throws {@link SignerRequiredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider report different chain IDs.
   */
  async requireChainAlignment(operation: string): Promise<number> {
    const signer = this.requireSigner(operation);
    const [signerChainId, providerChainId] = await Promise.all([
      signer.getChainId(),
      this.provider.getChainId(),
    ]);
    if (signerChainId !== providerChainId) {
      throw new ChainMismatchError({
        operation,
        signerChainId,
        providerChainId,
      });
    }
    return signerChainId;
  }

  async #handleIdentityChange(change: SignerIdentityChange): Promise<void> {
    const credentialService = this.#credentialService;
    if (credentialService) {
      await swallow("credential identity change", () =>
        credentialService.handleIdentityChange(change.previous, change.next),
      );
    }
    const previous = change.previous;
    if (previous) {
      await swallow("clear decrypt cache", () => this.cache.clearForRequester(previous.address));
    }
    const nextChainId = change.next?.chainId;
    if (nextChainId !== undefined) {
      try {
        this.relayer.switchChain(nextChainId);
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.warn(`[zama-sdk] switch relayer chain failed:`, error);
        return;
      }
    }
    await Promise.all(
      Array.from(this.#identityListeners, (listener) =>
        swallow("identity listener", () => listener(change)),
      ),
    );
  }

  /**
   * Create a read-only interface for a confidential token.
   * Supports balance queries and authorization without a wrapper address.
   *
   * @param address - The confidential token contract address.
   * @returns A {@link ReadonlyToken} instance bound to this SDK.
   */
  createReadonlyToken(address: Address): ReadonlyToken {
    return new ReadonlyToken(this, address);
  }

  /**
   * Create a high-level ERC-20-like interface for a confidential token.
   * Includes write operations (transfer, shield, unshield).
   *
   * @param address - The confidential token contract address (also used as wrapper by default).
   * @param wrapper - Optional explicit wrapper address, if it differs from the token address.
   * @returns A {@link Token} instance bound to this SDK.
   */
  createToken(address: Address, wrapper?: Address): Token {
    return new Token(this, address, wrapper);
  }

  /**
   * Emit a structured SDK event. Used by {@link Token}/{@link ReadonlyToken}
   * to surface lifecycle events through the unified SDK event stream.
   *
   * Listener exceptions are caught and logged so that a misbehaving subscriber
   * can never corrupt SDK operations.
   *
   * Application code should subscribe via the `onEvent` config option, never
   * call this directly.
   *
   * @internal
   */
  emitEvent(input: ZamaSDKEventInput, tokenAddress?: Address): void {
    try {
      this.#onEvent({
        ...input,
        tokenAddress,
        timestamp: Date.now(),
      } as ZamaSDKEvent);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error("[zama-sdk] onEvent listener threw:", error);
    }
  }

  /**
   * Create a {@link WrappersRegistry} instance bound to this SDK's provider.
   * On Mainnet and Sepolia the registry address is resolved automatically.
   *
   * @param registryAddresses - Optional per-chain overrides (e.g. Hardhat).
   * @returns A {@link WrappersRegistry} instance.
   *
   * @example
   * ```ts
   * // Mainnet / Sepolia — resolved automatically
   * const registry = sdk.createWrappersRegistry();
   *
   * // Hardhat or custom chain — override per chain
   * const registry = sdk.createWrappersRegistry({ [31337]: "0xYourRegistry" });
   *
   * const pairs = await registry.getTokenPairs();
   * ```
   */
  createWrappersRegistry(registryAddresses?: Record<number, Address>): WrappersRegistry {
    return new WrappersRegistry({
      provider: this.provider,
      registryAddresses,
      registryTTL: this.#registryTTL,
    });
  }

  /**
   * Pre-authorize contract addresses for direct decryption.
   *
   * If a permit covering the requested set already exists, no wallet prompt
   * occurs. Otherwise the SDK chunks the uncovered subset into groups of ≤10
   * contracts and prompts once per chunk; partial mid-flight rejection is
   * preserved (already-signed chunks are persisted before the next prompt).
   *
   * @param contracts - Contract addresses to authorize.
   */
  async allow(contracts: Address[]): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("allow");
    await this.requireChainAlignment("allow");
    await service.allow(contracts);
  }

  /**
   * Pre-authorize contract addresses for delegated decryption on behalf of `delegator`.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to authorize.
   */
  async allowAs(delegator: Address, contracts: Address[]): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("allowAs");
    await this.requireChainAlignment("allowAs");
    await service.allow(contracts, delegator);
  }

  /**
   * Pure store lookup: are stored permits sufficient to cover `contracts`?
   * No wallet prompt, no keypair generation. Returns `false` when no signer
   * is configured.
   */
  async isAllowed(contracts: Address[]): Promise<boolean> {
    if (!this.#credentialService) {
      return false;
    }
    return this.#credentialService.isAllowed(contracts);
  }

  /**
   * Pure store lookup for a delegated scope. No wallet prompt. See {@link isAllowed}.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to check.
   * @returns `true` if cached delegated permits cover all requested contracts.
   */
  async isAllowedAs(delegator: Address, contracts: Address[]): Promise<boolean> {
    if (!this.#credentialService) {
      return false;
    }
    return this.#credentialService.isAllowed(contracts, delegator);
  }

  /**
   * Decrypt one or more FHE handles. Results are cached — repeated calls
   * for the same handle skip the relayer round-trip.
   *
   * Zero handles are mapped to `0n` without hitting the relayer.
   * Events (`DecryptStart/End/Error`) are emitted uniformly.
   * Relayer errors are wrapped into typed SDK errors.
   *
   * @param handles - Handles to decrypt, each paired with its contract address.
   * @returns A record mapping each handle to its decrypted clear-text value.
   * @throws {@link SignerRequiredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   *
   * @example
   * ```ts
   * const values = await sdk.userDecrypt([
   *   { handle: balanceHandle, contractAddress: cUSDT },
   * ]);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async userDecrypt(handles: DecryptHandle[]): Promise<Record<Handle, ClearValueType>> {
    const signer = this.requireSigner("userDecrypt");
    const service = this.#requireCredentialService("userDecrypt");
    await this.requireChainAlignment("userDecrypt");
    if (handles.length === 0) {
      return {};
    }

    // Normalize addresses once at the top
    const normalized = handles.map((h) => ({
      handle: h.handle,
      contractAddress: getAddress(h.contractAddress),
    }));

    const result: Record<Handle, ClearValueType> = {};
    const nonZero: DecryptHandle[] = [];

    // Filter zero handles → 0n without relayer
    for (const h of normalized) {
      if (isZeroHandle(h.handle)) {
        result[h.handle] = 0n;
      } else {
        nonZero.push(h);
      }
    }

    if (nonZero.length === 0) {
      return result;
    }

    // Cache partition
    const signerAddress = await signer.getAddress();
    const uncached: DecryptHandle[] = [];

    for (const h of nonZero) {
      const cached = await this.cache.get(signerAddress, h.contractAddress, h.handle);
      if (cached !== null) {
        result[h.handle] = cached;
      } else {
        uncached.push(h);
      }
    }

    if (uncached.length === 0) {
      return result;
    }

    // Derive contract addresses from ALL handles for stable credential cache key
    const allContracts = Array.from(new Set(normalized.map((h) => h.contractAddress)));
    const credentials = await service.allow(allContracts);

    // Group uncached handles by contract.
    const byContract = new Map<Address, Handle[]>();
    for (const h of uncached) {
      const existing = byContract.get(h.contractAddress);
      if (existing) {
        existing.push(h.handle);
      } else {
        byContract.set(h.contractAddress, [h.handle]);
      }
    }

    const t0 = Date.now();
    const uncachedHandles = uncached.map((h) => h.handle);

    try {
      this.emitEvent({
        type: ZamaSDKEvents.DecryptStart,
        handles: uncachedHandles,
      });

      await pLimit(
        [...byContract.entries()].map(([contractAddress, contractHandles]) => async () => {
          const decrypted = await this.relayer.userDecrypt({
            handles: contractHandles,
            contractAddress,
            ...resolveUserDecryptPermit(credentials, contractAddress),
            signerAddress,
          });

          for (const [handle, value] of Object.entries(decrypted)) {
            result[handle as Handle] = value;
            await this.cache.set(signerAddress, contractAddress, handle as Handle, value);
          }
        }),
        5,
      );

      // Emit only the freshly-decrypted subset in `result` so its keys match
      // `handles`. Cached and zero-handle entries are intentionally excluded.
      const uncachedResult: Record<Handle, ClearValueType> = {};
      for (const handle of uncachedHandles) {
        const value = result[handle];
        if (value !== undefined) {
          uncachedResult[handle] = value;
        }
      }
      this.emitEvent({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
        handles: uncachedHandles,
        result: uncachedResult,
      });
      return result;
    } catch (error) {
      this.emitEvent({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
        handles: uncachedHandles,
      });
      throw wrapDecryptError(error, "Failed to decrypt handles");
    }
  }

  /**
   * Decrypt one or more FHE handles using delegated credentials.
   *
   * Mirrors {@link userDecrypt} with delegated credentials — same caching,
   * zero-handle short-circuit, event lifecycle, and error wrapping. The
   * delegator address identifies the account that granted delegation rights.
   *
   * @param handles - FHE handles paired with their contract addresses.
   * @param delegatorAddress - The address that granted delegation rights.
   * @param accountAddress - Address used as the cache key's "requester"
   *   dimension. Defaults to `delegatorAddress`. Pass the actual account address
   *   when decrypting on behalf of someone whose balance is stored under a
   *   different address (e.g. `decryptBalanceAs` with an explicit `accountAddress`).
   * @returns Map of handle → clear-text value.
   *
   * @example
   * ```ts
   * const values = await sdk.delegatedUserDecrypt([
   *   { handle: balanceHandle, contractAddress: tokenAddr },
   * ], delegatorAddr);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async delegatedUserDecrypt(
    handles: DecryptHandle[],
    delegatorAddress: Address,
    accountAddress: Address = delegatorAddress,
  ): Promise<Record<Handle, ClearValueType>> {
    const signer = this.requireSigner("delegatedUserDecrypt");
    const service = this.#requireCredentialService("delegatedUserDecrypt");
    await this.requireChainAlignment("delegatedUserDecrypt");
    if (handles.length === 0) {
      return {};
    }

    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedAccount = getAddress(accountAddress);

    // Normalize addresses once at the top
    const normalized = handles.map((h) => ({
      handle: h.handle,
      contractAddress: getAddress(h.contractAddress),
    }));

    const result: Record<Handle, ClearValueType> = {};
    const nonZero: DecryptHandle[] = [];

    // Filter zero handles → 0n without relayer
    for (const h of normalized) {
      if (isZeroHandle(h.handle)) {
        result[h.handle] = 0n;
      } else {
        nonZero.push(h);
      }
    }

    if (nonZero.length === 0) {
      return result;
    }

    // Delegated cache hits must still sit behind the current delegate's
    // authorization. Otherwise shared storage could return plaintext from a
    // previous delegate/session without a live delegated permit.
    const allContracts = Array.from(new Set(normalized.map((h) => h.contractAddress)));
    const credentials = await service.allow(allContracts, normalizedDelegator);

    const delegateAddress = await signer.getAddress();

    // Verify on-chain delegation is still active for each contract before
    // serving cached delegated plaintext. The SDK-side `service.allow()` only
    // proves the delegate signed a permit — it does NOT detect on-chain
    // revocation or expiry. Without this check, a cache hit could leak
    // plaintext that the delegator has since revoked on-chain.
    const revokedContracts = await findRevokedDelegations({
      provider: this.provider,
      relayer: this.relayer,
      contractAddresses: allContracts,
      delegatorAddress: normalizedDelegator,
      delegateAddress,
    });

    // Cache partition
    const uncached: DecryptHandle[] = [];

    for (const h of nonZero) {
      if (revokedContracts.has(h.contractAddress)) {
        // Drop any cached plaintext for revoked contracts so the next path
        // fetches fresh (and the relayer enforces its own on-chain check).
        await this.cache.delete(normalizedAccount, h.contractAddress, h.handle);
        uncached.push(h);
        continue;
      }
      const cached = await this.cache.get(normalizedAccount, h.contractAddress, h.handle);
      if (cached !== null) {
        result[h.handle] = cached;
      } else {
        uncached.push(h);
      }
    }

    if (uncached.length === 0) {
      return result;
    }

    // Group uncached by contract
    const byContract = new Map<Address, Handle[]>();
    for (const h of uncached) {
      const existing = byContract.get(h.contractAddress);
      if (existing) {
        existing.push(h.handle);
      } else {
        byContract.set(h.contractAddress, [h.handle]);
      }
    }

    // Decrypt per contract group with bounded concurrency
    const t0 = Date.now();
    const uncachedHandles = uncached.map((h) => h.handle);

    try {
      this.emitEvent({
        type: ZamaSDKEvents.DecryptStart,
        handles: uncachedHandles,
      });

      await pLimit(
        [...byContract.entries()].map(([contractAddress, contractHandles]) => async () => {
          const decrypted = await this.relayer.delegatedUserDecrypt({
            handles: contractHandles,
            contractAddress,
            ...resolveDelegatedDecryptPermit(credentials, contractAddress),
            delegateAddress,
          });

          for (const [handle, value] of Object.entries(decrypted)) {
            result[handle as Handle] = value;
            await this.cache.set(normalizedAccount, contractAddress, handle as Handle, value);
          }
        }),
        5,
      );

      const uncachedResult: Record<Handle, ClearValueType> = {};
      for (const handle of uncachedHandles) {
        const value = result[handle];
        if (value !== undefined) {
          uncachedResult[handle] = value;
        }
      }
      this.emitEvent({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
        handles: uncachedHandles,
        result: uncachedResult,
      });
      return result;
    } catch (error) {
      this.emitEvent({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
        handles: uncachedHandles,
      });
      throw wrapDecryptError(error, "Failed to decrypt delegated handles", true);
    }
  }

  /**
   * Publicly decrypt one or more FHE handles.
   *
   * Returns the decryption proof alongside the clear-text values so callers
   * can submit on-chain finalization transactions (e.g. `finalizeUnwrap`).
   *
   * @param handles - FHE handles to decrypt publicly.
   * @returns Clear-text values, ABI-encoded values, and the decryption proof.
   *
   * @example
   * ```ts
   * const { clearValues, decryptionProof, abiEncodedClearValues } =
   *   await sdk.publicDecrypt([handle]);
   * ```
   */
  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    if (handles.length === 0) {
      return {
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      };
    }

    try {
      return await this.relayer.publicDecrypt(handles);
    } catch (error) {
      throw wrapDecryptError(error, "Public decryption failed");
    }
  }

  /**
   * Encrypt one or more plaintext values into FHE ciphertexts.
   *
   * @param params - Typed FHE inputs, the target contract address, and the user address.
   * @returns Encrypted handles and the input proof for on-chain submission.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   *
   * @example
   * ```ts
   * const { handles, inputProof } = await sdk.encrypt({
   *   values: [{ value: 1000n, type: "euint64" }],
   *   contractAddress: "0xToken",
   *   userAddress: "0xUser",
   * });
   * ```
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const t0 = Date.now();
    try {
      this.emitEvent({ type: ZamaSDKEvents.EncryptStart }, params.contractAddress);
      const result = await this.relayer.encrypt(params);
      this.emitEvent(
        {
          type: ZamaSDKEvents.EncryptEnd,
          durationMs: Date.now() - t0,
        },
        params.contractAddress,
      );
      return result;
    } catch (error) {
      this.emitEvent(
        {
          type: ZamaSDKEvents.EncryptError,
          error: toError(error),
          durationMs: Date.now() - t0,
        },
        params.contractAddress,
      );
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Encryption failed", {
        cause: error,
      });
    }
  }

  /**
   * Wipe FHE permits for the current signer.
   *
   * - With no argument: every permit referencing this signer is removed across
   *   all chains and delegators. The keypair survives — use
   *   {@link clearCredentials} to also wipe the keypair.
   * - With a contract list: every signed permit in the direct-decrypt scope
   *   (current chain) whose immutable payload touches any listed address is
   *   removed. May also drop coverage for other contracts that shared the same
   *   permit. Delegated permits are not touched in this mode.
   *
   * @throws {@link SignerRequiredError} if no signer is configured.
   */
  async revokePermits(contracts?: Address[]): Promise<void> {
    const signer = this.requireSigner("revokePermits");
    const service = this.#requireCredentialService("revokePermits");
    const signerAddress = await signer.getAddress();
    try {
      await service.revokePermits(contracts);
    } finally {
      await swallow("clear decrypt cache", () => this.cache.clearForRequester(signerAddress));
    }
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every permit
   * (across chains and delegators) referencing it.
   *
   * @throws {@link SignerRequiredError} if no signer is configured.
   */
  async clearCredentials(): Promise<void> {
    const signer = this.requireSigner("clearCredentials");
    const service = this.#requireCredentialService("clearCredentials");
    const signerAddress = await signer.getAddress();
    try {
      await service.clearCredentials();
    } finally {
      await swallow("clear decrypt cache", () => this.cache.clearForRequester(signerAddress));
    }
  }

  /**
   * Unsubscribe from signer lifecycle events without terminating the relayer.
   * Call this when the SDK instance is being replaced but the relayer is shared
   * (e.g. React provider remount in Strict Mode).
   */
  dispose(): void {
    this.#unsubscribeSigner?.();
    this.#unsubscribeSigner = undefined;
    this.#identityListeners.clear();
  }

  /**
   * Terminate the relayer backend and clean up resources.
   * Call this when the SDK is no longer needed (e.g. on unmount or shutdown).
   */
  terminate(): void {
    this.dispose();
    this.relayer.terminate();
  }

  /**
   * Implements the TC39 Explicit Resource Management protocol.
   * Calls {@link terminate} when the `using` binding goes out of scope,
   * unsubscribing signer events and shutting down the relayer.
   *
   * @example
   * ```ts
   * {
   *   using sdk = new ZamaSDK({ relayer, provider, signer, storage });
   *   await sdk.allow([cUSDT]);
   *   const balance = await sdk.createReadonlyToken(cUSDT).balanceOf();
   * } // sdk.terminate() called automatically here
   * ```
   */
  [Symbol.dispose](): void {
    this.terminate();
  }
}

function buildCredentialServiceConfig(
  relayer: RelayerDispatcher,
  signer: GenericSigner,
  opts: Pick<
    CredentialServiceConfig,
    "keypairTTL" | "permitDuration" | "storage" | "permitStorage" | "onEvent"
  >,
): CredentialServiceConfig {
  return {
    keypairGenerator: {
      generateKeypair: () => relayer.generateKeypair(),
    },
    permitFactory: {
      createEIP712: (publicKey, contracts, startTimestamp, durationDays) =>
        relayer.createEIP712(publicKey, contracts, startTimestamp, durationDays),
      createDelegatedUserDecryptEIP712: (
        publicKey,
        contracts,
        delegator,
        startTimestamp,
        durationDays,
      ) =>
        relayer.createDelegatedUserDecryptEIP712(
          publicKey,
          contracts,
          delegator,
          startTimestamp,
          durationDays,
        ),
    },
    permitSigner: {
      signTypedData: (td) => signer.signTypedData(td),
      getAddress: () => signer.getAddress(),
      getChainId: () => signer.getChainId(),
    },
    ...opts,
  };
}
