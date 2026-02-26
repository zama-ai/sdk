import type { Address } from "../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { normalizeAddress } from "../utils";
import { Token } from "./token";
import { ReadonlyToken } from "./readonly-token";
import type { GenericSigner, GenericStringStorage } from "./token.types";
import type { ZamaSDKEventListener } from "../events/sdk-events";

/** Configuration for {@link ZamaSDK}. */
export interface ZamaSDKConfig {
  /** FHE relayer backend (`RelayerWeb` for browser, `RelayerNode` for server). */
  relayer: RelayerSDK;
  /** Wallet signer (`ViemSigner`, `EthersSigner`, or custom {@link GenericSigner}). */
  signer: GenericSigner;
  /** Credential storage backend (`IndexedDBStorage` for browser, `MemoryStorage` for tests). */
  storage: GenericStringStorage;
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
  readonly storage: GenericStringStorage;
  readonly #credentialDurationDays: number | undefined;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: ZamaSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
    this.#credentialDurationDays = config.credentialDurationDays;
    this.#onEvent = config.onEvent;
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
      address: normalizeAddress(address, "address"),
      wrapper: wrapper ? normalizeAddress(wrapper, "wrapper") : undefined,
      durationDays: this.#credentialDurationDays,
      onEvent: this.#onEvent,
    });
  }

  /**
   * Terminate the relayer backend and clean up resources.
   * Call this when the SDK is no longer needed (e.g. on unmount or shutdown).
   */
  terminate(): void {
    this.relayer.terminate();
  }
}
