import type { Address } from "../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { normalizeAddress } from "../utils";
import { Token } from "./token";
import { ReadonlyToken } from "./readonly-token";
import { MemoryStorage } from "./memory-storage";
import { CredentialsManager } from "./credentials-manager";
import type { GenericSigner, GenericStorage } from "./token.types";
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
  readonly #credentialDurationDays: number | undefined;
  readonly #onEvent: ZamaSDKEventListener | undefined;
  #unsubscribeSigner?: () => void;

  constructor(config: ZamaSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
    this.sessionStorage = config.sessionStorage ?? new MemoryStorage();
    this.#credentialDurationDays = config.credentialDurationDays;
    this.#onEvent = config.onEvent;

    if (this.signer.subscribe) {
      this.#unsubscribeSigner = this.signer.subscribe({
        onDisconnect: () => this.revokeSession(),
        onAccountChange: () => this.revokeSession(),
      });
    }
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
      sdk: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      address: normalizeAddress(address, "address"),
      durationDays: this.#credentialDurationDays,
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
      sdk: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      address: normalizeAddress(address, "address"),
      wrapper: wrapper ? normalizeAddress(wrapper, "wrapper") : undefined,
      durationDays: this.#credentialDurationDays,
      onEvent: this.#onEvent,
    });
  }

  /**
   * Revoke the session signature for the current signer.
   * The next decrypt operation will require a fresh wallet signature.
   *
   * Unlike `token.credentials.revoke()`, this does not require a token address —
   * useful for wallet disconnect/account-change handlers.
   *
   * @example
   * ```ts
   * wallet.on("disconnect", () => sdk.revokeSession());
   * ```
   */
  async revokeSession(): Promise<void> {
    const cm = new CredentialsManager({
      sdk: this.relayer,
      signer: this.signer,
      storage: this.storage,
      sessionStorage: this.sessionStorage,
      durationDays: 1, // irrelevant for revoke
      onEvent: this.#onEvent,
    });
    await cm.revoke();
  }

  /**
   * Terminate the relayer backend and clean up resources.
   * Call this when the SDK is no longer needed (e.g. on unmount or shutdown).
   */
  terminate(): void {
    this.#unsubscribeSigner?.();
    this.relayer.terminate();
  }
}
