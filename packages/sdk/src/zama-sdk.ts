import { getAddress, type Address } from "viem";
import { CredentialsManager } from "./credentials/credentials-manager";
import { DelegatedCredentialsManager } from "./credentials/delegated-credentials-manager";
import { DecryptCache } from "./decrypt-cache";
import { wrapDecryptError } from "./errors";
import type { ZamaSDKEventListener } from "./events/sdk-events";
import { ZamaSDKEvents } from "./events/sdk-events";
import type { DecryptHandle } from "./query/user-decrypt";
import { ZERO_HANDLE } from "./query/utils";
import type { RelayerSDK } from "./relayer/relayer-sdk";
import type { ClearValueType, Handle } from "./relayer/relayer-sdk.types";
import { MemoryStorage } from "./storage/memory-storage";
import { pLimit } from "./utils/concurrency";
import { ReadonlyToken } from "./token/readonly-token";
import { Token } from "./token/token";
import type { GenericSigner, GenericStorage, SignerLifecycleCallbacks } from "./types";
import { toError } from "./utils";
import { WrappersRegistry } from "./wrappers-registry";

/** Maximum keypairTTL accepted by the fhevm ACL contract (365 days, in seconds). */
const MAX_KEYPAIR_TTL = 365 * 86400; // 31_536_000 s

/** Configuration for {@link ZamaSDK}. */
export interface ZamaSDKConfig {
  /** FHE relayer backend (`RelayerWeb` for browser, `RelayerNode` for server). */
  relayer: RelayerSDK;
  /** Wallet signer (`ViemSigner`, `EthersSigner`, or custom {@link GenericSigner}). */
  signer: GenericSigner;
  /** Credential storage backend (`IndexedDBStorage` for browser, `MemoryStorage` for tests). */
  storage: GenericStorage;
  /**
   * Session storage for wallet signatures. Shared across all contracts in this SDK instance.
   * Defaults to an in-memory store (lost on page reload). Pass a `chrome.storage.session`-backed
   * implementation for web extensions so signatures survive service worker restarts.
   */
  sessionStorage?: GenericStorage;
  /**
   * How long the ML-KEM re-encryption keypair remains valid, in seconds.
   * Default: `2592000` (30 days). Must be a positive number — `0` is rejected
   * because the keypair is required to establish the relayer connection.
   * Maximum: `31536000` (365 days) — the fhevm contract rejects `durationDays > 365`.
   * Values above this maximum are automatically capped with a console warning.
   */
  keypairTTL?: number;
  /**
   * Controls how long session signatures (EIP-712 wallet signatures) remain valid, in seconds.
   * Default: `2592000` (30 days).
   * - `0`: never persist — every operation triggers a signing prompt (high-security mode).
   * - `"infinite"`: session never expires.
   * - Positive number: seconds until the session signature expires and requires re-authentication.
   */
  sessionTTL?: number | "infinite";
  /** Optional structured event listener for debugging and telemetry. Never receives sensitive data. */
  onEvent?: ZamaSDKEventListener;
  /**
   * Per-chain wrappers registry address overrides, merged on top of built-in defaults.
   * Use this for custom or local chains (e.g. Hardhat) where no default registry exists.
   */
  registryAddresses?: Record<number, Address>;
  /**
   * How long cached registry results remain valid, in seconds.
   * Default: `86400` (24 hours).
   */
  registryTTL?: number;
  /** Optional signer lifecycle callbacks composed with the SDK's internal session handling. */
  signerLifecycleCallbacks?: SignerLifecycleCallbacks;
}

/**
 * ZamaSDK — composes a RelayerSDK with contract abstraction.
 * Provides signer, storage, and high-level confidential contract interface.
 */
export class ZamaSDK {
  readonly relayer: RelayerSDK;
  readonly signer: GenericSigner;
  readonly storage: GenericStorage;
  readonly sessionStorage: GenericStorage;
  readonly credentials: CredentialsManager;
  readonly delegatedCredentials: DelegatedCredentialsManager;
  /** Persistent cache for decrypted FHE plaintext values, scoped by (requester, contract, handle). */
  readonly cache: DecryptCache;
  /**
   * A {@link WrappersRegistry} instance auto-configured for the current chain.
   * Uses built-in defaults merged with any `registryAddresses` overrides, and the SDK's `registryTTL` if configured.
   *
   * @example
   * ```ts
   * const pairs = await sdk.registry.listPairs({ page: 1 });
   * const result = await sdk.registry.getConfidentialToken(erc20Address);
   * ```
   */
  readonly registry: WrappersRegistry;
  readonly #registryTTL: number | undefined;
  readonly #onEvent: ZamaSDKEventListener;
  #unsubscribeSigner?: () => void;
  // oxlint false positive: awaited in #revokeByTrackedIdentity() and revokeSession()
  // eslint-disable-next-line no-unused-private-class-members
  #identityReady: Promise<void>;
  #lastAddress: Address | null = null;
  #lastChainId: number | null = null;

  constructor(config: ZamaSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
    this.sessionStorage = config.sessionStorage ?? new MemoryStorage();
    this.cache = new DecryptCache(config.storage);
    this.#onEvent = config.onEvent ?? function () {};
    this.registry = new WrappersRegistry({
      signer: this.signer,
      registryAddresses: config.registryAddresses,
      registryTTL: config.registryTTL,
    });
    this.#registryTTL = config.registryTTL;
    const credentialsConfig = {
      relayer: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      keypairTTL: (() => {
        const ttl = config.keypairTTL ?? 2592000;
        if (ttl <= 0 || isNaN(ttl)) {
          throw new Error("keypairTTL must be a positive number (seconds)");
        }
        if (ttl > MAX_KEYPAIR_TTL) {
          // oxlint-disable-next-line no-console
          console.warn(
            `[zama-sdk] keypairTTL (${ttl}s) exceeds the fhevm maximum of 365 days (${MAX_KEYPAIR_TTL}s); capping to ${MAX_KEYPAIR_TTL}s.`,
          );
          return MAX_KEYPAIR_TTL;
        }
        return ttl;
      })(),
      sessionTTL: config.sessionTTL ?? 2592000,
      onEvent: this.#onEvent,
    };
    this.credentials = new CredentialsManager(credentialsConfig);
    this.delegatedCredentials = new DelegatedCredentialsManager(credentialsConfig);
    this.#identityReady = this.#initIdentity();

    if (this.signer.subscribe) {
      const lifecycleCallbacks = config.signerLifecycleCallbacks;
      const runLifecycleEffect = (operation: string, effect: () => Promise<void>) => {
        void effect().catch((error) => {
          this.#onEvent?.({
            type: ZamaSDKEvents.TransactionError,
            operation,
            error: toError(error),
            timestamp: Date.now(),
          });
        });
      };
      this.#unsubscribeSigner = this.signer.subscribe({
        onDisconnect: () => {
          runLifecycleEffect("signerDisconnect", async () => {
            await this.#revokeByTrackedIdentity();
            await this.cache.clearAll();
            this.#lastAddress = null;
            this.#lastChainId = null;
            lifecycleCallbacks?.onDisconnect?.();
          });
        },
        onAccountChange: (newAddress: Address) => {
          runLifecycleEffect("signerAccountChange", async () => {
            await this.#revokeByTrackedIdentity();
            await this.cache.clearAll();
            this.#lastAddress = getAddress(newAddress);
            try {
              this.#lastChainId = await this.signer.getChainId();
            } catch {
              // Signer may not be ready — keep previous chainId
            }
            lifecycleCallbacks?.onAccountChange?.(newAddress);
          });
        },
        onChainChange: (newChainId: number) => {
          runLifecycleEffect("signerChainChange", async () => {
            await this.#revokeByTrackedIdentity();
            await this.cache.clearAll();
            this.#lastChainId = newChainId;
            try {
              this.#lastAddress = await this.signer.getAddress();
            } catch {
              // Signer may not be ready — keep previous address
            }
            lifecycleCallbacks?.onChainChange?.(newChainId);
          });
        },
      });
    }
  }

  async #initIdentity(): Promise<void> {
    try {
      const address = await this.signer.getAddress();
      const chainId = await this.signer.getChainId();
      // Only commit both values atomically so revokeByTrackedIdentity
      // never sees a partial (address-only) state.
      this.#lastAddress = address;
      this.#lastChainId = chainId;
    } catch {
      // Signer not ready yet — identity will be set on first lifecycle event
    }
  }

  async #revokeByTrackedIdentity(): Promise<void> {
    await this.#identityReady;
    if (this.#lastAddress === null || this.#lastChainId === null) {
      return;
    }
    const storeKey = await CredentialsManager.computeStoreKey(this.#lastAddress, this.#lastChainId);
    await this.credentials.revokeByKey(storeKey);
  }

  /**
   * Create a read-only interface for a confidential token.
   * Supports balance queries and authorization without a wrapper address.
   *
   * @param address - The confidential token contract address.
   * @returns A {@link ReadonlyToken} instance bound to this SDK's relayer, signer, and storage.
   */
  createReadonlyToken(address: Address): ReadonlyToken {
    return new ReadonlyToken({
      relayer: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      credentials: this.credentials,
      delegatedCredentials: this.delegatedCredentials,
      cache: this.cache,
      address: getAddress(address),
      onEvent: this.#onEvent,
    });
  }

  /**
   * Create a high-level ERC-20-like interface for a confidential token.
   * Includes write operations (transfer, shield, unshield).
   *
   * @param address - The confidential token contract address (also used as wrapper by default).
   * @param wrapper - Optional explicit wrapper address, if it differs from the token address.
   * @returns A {@link Token} instance bound to this SDK's relayer, signer, and storage.
   */
  createToken(address: Address, wrapper?: Address): Token {
    return new Token({
      relayer: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      credentials: this.credentials,
      delegatedCredentials: this.delegatedCredentials,
      cache: this.cache,
      address: getAddress(address),
      wrapper: wrapper ? getAddress(wrapper) : undefined,
      onEvent: this.#onEvent,
    });
  }

  /**
   * Create a {@link WrappersRegistry} instance bound to this SDK's signer.
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
      signer: this.signer,
      registryAddresses,
      registryTTL: this.#registryTTL,
    });
  }

  /**
   * Pre-authorize contract addresses for decryption, triggering a single
   * wallet signature prompt. Subsequent {@link userDecrypt} calls whose
   * handles span the same set will reuse the cached credentials without
   * an additional prompt.
   *
   * @param contractAddresses - One or more contract addresses to authorize.
   *
   * @example
   * ```ts
   * // Sign once for three tokens, then decrypt individually
   * await sdk.allow([cUSDT, cDAI, cWETH]);
   * const a = await sdk.userDecrypt([{ handle: h1, contractAddress: cUSDT }]);
   * const b = await sdk.userDecrypt([{ handle: h2, contractAddress: cDAI }]);
   * ```
   */
  async allow(contractAddresses: Address[]): Promise<void> {
    if (contractAddresses.length === 0) {
      return;
    }
    await this.credentials.allow(...contractAddresses);
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
      if (h.handle === ZERO_HANDLE) {
        result[h.handle] = 0n;
      } else {
        nonZero.push(h);
      }
    }

    if (nonZero.length === 0) {
      return result;
    }

    // Cache partition
    const signerAddress = await this.signer.getAddress();
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
    const allContractAddresses = [...new Set(normalized.map((h) => h.contractAddress))];
    const creds = await this.credentials.allow(...allContractAddresses);

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
    this.#onEvent({ type: ZamaSDKEvents.DecryptStart, timestamp: t0 });

    try {
      await pLimit(
        [...byContract.entries()].map(([contractAddress, contractHandles]) => async () => {
          const decrypted = await this.relayer.userDecrypt({
            handles: contractHandles,
            contractAddress,
            signedContractAddresses: creds.contractAddresses,
            privateKey: creds.privateKey,
            publicKey: creds.publicKey,
            signature: creds.signature,
            signerAddress,
            startTimestamp: creds.startTimestamp,
            durationDays: creds.durationDays,
          });

          for (const [handle, value] of Object.entries(decrypted)) {
            result[handle as Handle] = value;
            await this.cache.set(signerAddress, contractAddress, handle as Handle, value);
          }
        }),
        5,
      );

      this.#onEvent({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      this.#onEvent({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
        timestamp: Date.now(),
      });
      throw wrapDecryptError(error, "Failed to decrypt handles");
    }
  }

  /**
   * Revoke the session signature for the current signer without requiring
   * contract addresses. Uses the tracked identity when available (safe during
   * account switches), falling back to querying the signer directly.
   *
   * @example
   * ```ts
   * wallet.on("disconnect", () => sdk.revokeSession());
   * ```
   */
  async revokeSession(): Promise<void> {
    await this.#identityReady;
    const address = this.#lastAddress ?? (await this.signer.getAddress());
    const chainId = this.#lastChainId ?? (await this.signer.getChainId());
    const storeKey = await CredentialsManager.computeStoreKey(address, chainId);
    await this.credentials.revokeByKey(storeKey);
    await this.cache.clearForRequester(address);
  }

  /**
   * Unsubscribe from signer lifecycle events without terminating the relayer.
   * Call this when the SDK instance is being replaced but the relayer is shared
   * (e.g. React provider remount in Strict Mode).
   */
  dispose(): void {
    this.#unsubscribeSigner?.();
    this.#unsubscribeSigner = undefined;
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
   *   using sdk = new ZamaSDK({ relayer, signer, storage });
   *   await sdk.credentials.allow(cUSDT);
   *   const balance = await sdk.createReadonlyToken(cUSDT).balanceOf();
   * } // sdk.terminate() called automatically here
   * ```
   */
  [Symbol.dispose](): void {
    this.terminate();
  }
}
