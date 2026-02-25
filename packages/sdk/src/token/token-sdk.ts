import type { Address } from "../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { normalizeAddress } from "../utils";
import { Token } from "./token";
import { ReadonlyToken } from "./readonly-token";
import type { GenericSigner, GenericStringStorage } from "./token.types";
import type { ZamaSDKEventListener } from "../events/sdk-events";

/** Configuration for {@link TokenSDK}. */
export interface TokenSDKConfig {
  /** FHE relayer backend (`RelayerWeb` for browser, `RelayerNode` for server). */
  relayer: RelayerSDK;
  /** Wallet signer (`ViemSigner`, `EthersSigner`, or custom {@link GenericSigner}). */
  signer: GenericSigner;
  /** Credential storage backend (`IndexedDBStorage` for browser, `MemoryStorage` for tests). */
  storage: GenericStringStorage;
  /** Number of days FHE credentials remain valid. Default: `1`. */
  credentialDurationDays?: number;
  /** Optional structured event listener for debugging and telemetry. Never receives sensitive data. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * TokenSDK — composes a RelayerSDK with token abstraction.
 * Provides signer, storage, and high-level ERC-20-like token interface.
 */
export class TokenSDK {
  readonly relayer: RelayerSDK;
  readonly signer: GenericSigner;
  readonly storage: GenericStringStorage;
  readonly #credentialDurationDays: number | undefined;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: TokenSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
    this.#credentialDurationDays = config.credentialDurationDays;
    this.#onEvent = config.onEvent;
  }

  /**
   * Create a read-only interface for a confidential token.
   * Supports balance queries and authorization without a wrapper address.
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
   * Create a Token from a wrapper address by auto-discovering the underlying token.
   * Reads the underlying ERC-20 address from the wrapper contract.
   *
   * @param wrapperAddress - Address of the wrapper (confidential token) contract.
   * @returns A `Token` instance with both `address` (underlying) and `wrapper` set.
   */
  async createTokenFromWrapper(wrapperAddress: Address): Promise<Token> {
    const normalizedWrapper = normalizeAddress(wrapperAddress, "wrapperAddress");
    const readonlyToken = this.createReadonlyToken(normalizedWrapper);
    const underlying = await readonlyToken.underlyingToken();
    return this.createToken(underlying, normalizedWrapper);
  }

  /**
   * Terminate the relayer backend and clean up resources.
   */
  terminate(): void {
    this.relayer.terminate();
  }
}
