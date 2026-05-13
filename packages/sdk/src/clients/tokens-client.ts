import type { Address } from "viem";
import { Token } from "../token/token";
import { WrappedToken } from "../token/wrapped-token";
import type { ZamaSDK } from "../zama-sdk";

/**
 * Public client for ERC-7984 token bindings.
 *
 * Exposed as `sdk.tokens`. A factory — `confidential(addr)` returns a {@link Token}
 * for an ERC-7984 confidential token; `wrapper(addr)` returns a {@link WrappedToken}
 * for an ERC-7984 wrapper (cToken ↔ ERC-20 pair).
 *
 * No on-chain reads happen during instantiation. The returned objects are stateful
 * bindings to the contract at `addr`; subsequent calls with the same address return
 * new instances (no caching at this layer).
 */
export class TokensClient {
  readonly #sdk: ZamaSDK;

  /** @internal */
  constructor(sdk: ZamaSDK) {
    this.#sdk = sdk;
  }

  /**
   * Create a high-level ERC-20-style interface for an ERC-7984 confidential token.
   * Supports balance queries, transfers, operator approvals, and decryption.
   *
   * For ERC-7984 wrappers (shield/unshield/allowance), use {@link wrapper} instead.
   *
   * @param address - The confidential token contract address.
   * @returns A {@link Token} instance bound to this SDK.
   */
  confidential(address: Address): Token {
    return new Token(this.#sdk, address);
  }

  /**
   * Create a high-level interface for an ERC-7984 wrapper token.
   * Extends {@link Token} with shield/unshield/allowance/finalize-unwrap operations.
   *
   * @param address - The wrapper token contract address.
   * @returns A {@link WrappedToken} instance bound to this SDK.
   */
  wrapper(address: Address): WrappedToken {
    return new WrappedToken(this.#sdk, address);
  }
}
