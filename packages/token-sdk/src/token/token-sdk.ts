import type { Address } from "../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { Token } from "./token";
import { ReadonlyToken } from "./readonly-token";
import type { ConfidentialSigner, GenericStringStorage } from "./token.types";

export interface TokenSDKConfig {
  relayer: RelayerSDK;
  signer: ConfidentialSigner;
  storage: GenericStringStorage;
}

/**
 * TokenSDK — composes a RelayerSDK with token abstraction.
 * Provides signer, storage, and high-level ERC-20-like token interface.
 */
export class TokenSDK {
  readonly relayer: RelayerSDK;
  readonly signer: ConfidentialSigner;
  readonly storage: GenericStringStorage;

  constructor(config: TokenSDKConfig) {
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.storage = config.storage;
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
      address,
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
      address,
      wrapper,
    });
  }

  /**
   * Terminate the relayer backend and clean up resources.
   */
  terminate(): void {
    this.relayer.terminate();
  }
}
