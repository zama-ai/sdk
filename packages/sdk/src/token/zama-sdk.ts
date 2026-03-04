import type { Address } from "../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { normalizeAddress } from "../utils";
import { Token } from "./token";
import { ReadonlyToken } from "./readonly-token";
import { MemoryStorage } from "./memory-storage";
import { CredentialsManager, computeStoreKey } from "./credentials-manager";
import type { GenericSigner, GenericStorage, SessionTTL } from "./token.types";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ZamaSDKEventListener } from "../events/sdk-events";

/** Configuration for {@link ZamaSDK}. */
export interface ZamaSDKConfig {
  /** FHE relayer backend (`RelayerWeb` for browser, `RelayerNode` for server). */
  relayer: RelayerSDK;
  /** Wallet signer (`ViemSigner`, `EthersSigner`, or custom {@link GenericSigner}). */
  signer: GenericSigner;
  /** Credential storage backend (`IndexedDBStorage` for browser, `MemoryStorage` for tests). */
  storage: GenericStorage;
  /**
   * Session storage for wallet signatures. Shared across all tokens created by this SDK instance.
   * Defaults to an in-memory store (lost on page reload). Pass a `chrome.storage.session`-backed
   * implementation for web extensions so signatures survive service worker restarts.
   */
  sessionStorage?: GenericStorage;
  /** Number of days FHE credentials remain valid. Default: `1`. Set `0` to require a wallet signature on every decrypt (high-security mode). */
  credentialDurationDays?: number;
  /**
   * Controls how long session signatures (EIP-712 wallet signatures) remain valid.
   * - `"persistent"` (default): no time-based expiry, sessions last until revocation or storage clear.
   * - `0`: never persist — every operation triggers a signing prompt (high-security mode).
   * - Positive number: seconds until the session signature expires and requires re-authentication.
   */
  sessionTTL?: SessionTTL;
  /** Optional structured event listener for debugging and telemetry. Never receives sensitive data. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * ZamaSDK — composes a RelayerSDK with token abstraction.
 * Provides signer, storage, and high-level ERC-20-like token interface.
 */
export class ZamaSDK {
  readonly relayer: RelayerSDK;
  readonly signer: GenericSigner;
  readonly storage: GenericStorage;
  readonly sessionStorage: GenericStorage;
  readonly credentials: CredentialsManager;
  readonly #onEvent: ZamaSDKEventListener;
  #unsubscribeSigner?: () => void;
  #identityReady: Promise<void>;
  #lastAddress: string | null = null;
  #lastChainId: number | null = null;

  constructor(config: ZamaSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
    this.sessionStorage = config.sessionStorage ?? new MemoryStorage();
    this.#onEvent = config.onEvent ?? function () {};
    this.credentials = new CredentialsManager({
      relayer: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      durationDays: config.credentialDurationDays ?? 1,
      sessionTTL: config.sessionTTL ?? "persistent",
      onEvent: this.#onEvent,
    });
    this.#identityReady = this.#initIdentity();

    if (this.signer.subscribe) {
      this.#unsubscribeSigner = this.signer.subscribe({
        onDisconnect: () => {
          void this.#revokeByTrackedIdentity().then(() => {
            this.#lastAddress = null;
            this.#lastChainId = null;
          });
        },
        onAccountChange: (newAddress: Address) => {
          void this.#revokeByTrackedIdentity().then(async () => {
            this.#lastAddress = newAddress.toLowerCase();
            try {
              this.#lastChainId = await this.signer.getChainId();
            } catch {
              // Signer may not be ready — keep previous chainId
            }
          });
        },
      });
    }
  }

  async #initIdentity(): Promise<void> {
    try {
      const address = (await this.signer.getAddress()).toLowerCase();
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
    if (this.#lastAddress == null || this.#lastChainId == null) return;
    const storeKey = await computeStoreKey(this.#lastAddress, this.#lastChainId);
    await this.sessionStorage.delete(storeKey);
    this.#onEvent?.({
      type: ZamaSDKEvents.CredentialsRevoked,
      timestamp: Date.now(),
    });
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
      address: normalizeAddress(address, "address"),
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
      address: normalizeAddress(address, "address"),
      wrapper: wrapper ? normalizeAddress(wrapper, "wrapper") : undefined,
      onEvent: this.#onEvent,
    });
  }

  /**
   * Pre-authorize FHE credentials for one or more contract addresses.
   * A single wallet signature covers all addresses, so subsequent decrypt
   * operations on any of these tokens reuse cached credentials.
   *
   * @param contractAddresses - Token contract addresses to authorize.
   *
   * @example
   * ```ts
   * await sdk.allow("0xTokenA", "0xTokenB");
   * ```
   */
  async allow(...contractAddresses: Address[]): Promise<void> {
    await this.credentials.allow(...contractAddresses);
  }

  /**
   * Revoke the session signature for the current signer.
   * The next decrypt operation will require a fresh wallet signature.
   *
   * @param contractAddresses - Optional addresses included in the
   *   `credentials:revoked` event for observability.
   *
   * @example
   * ```ts
   * wallet.on("disconnect", () => sdk.revoke());
   * await sdk.revoke("0xTokenA", "0xTokenB");
   * ```
   */
  async revoke(...contractAddresses: Address[]): Promise<void> {
    await this.credentials.revoke(...contractAddresses);
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
    const address = this.#lastAddress ?? (await this.signer.getAddress()).toLowerCase();
    const chainId = this.#lastChainId ?? (await this.signer.getChainId());
    const storeKey = await computeStoreKey(address, chainId);
    await this.sessionStorage.delete(storeKey);
    this.#onEvent?.({
      type: ZamaSDKEvents.CredentialsRevoked,
      timestamp: Date.now(),
    });
  }

  /**
   * Whether a session signature is currently cached for the connected wallet.
   * Use this to check if decrypt operations can proceed without a wallet prompt.
   */
  async isAllowed(): Promise<boolean> {
    return this.credentials.isAllowed();
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
}
