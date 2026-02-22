import type { Hex } from "../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { Token } from "./token";
import { ReadonlyToken } from "./readonly-token";
import type { GenericSigner, GenericStringStorage } from "./token.types";

export interface TokenSDKConfig {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStringStorage;
  /** Number of days FHE credentials remain valid. Default: 1 */
  credentialDurationDays?: number;
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

  constructor(config: TokenSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
    this.#credentialDurationDays = config.credentialDurationDays;
  }

  /**
   * Create a read-only interface for a confidential token.
   * Supports balance queries and authorization without a wrapper address.
   */
  createReadonlyToken(address: Hex): ReadonlyToken {
    return new ReadonlyToken({
      sdk: this.relayer,
      signer: this.signer,
      storage: this.storage,
      address,
      durationDays: this.#credentialDurationDays,
    });
  }

  /**
   * Create a high-level ERC-20-like interface for a confidential token.
   * Includes write operations (transfer, shield, unshield).
   */
  createToken(address: Hex, wrapper?: Hex): Token {
    return new Token({
      sdk: this.relayer,
      signer: this.signer,
      storage: this.storage,
      address,
      wrapper,
      durationDays: this.#credentialDurationDays,
    });
  }

  /**
   * Terminate the relayer backend and clean up resources.
   */
  terminate(): void {
    this.relayer.terminate();
  }
}
