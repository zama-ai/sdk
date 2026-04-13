import { type Address, getAddress } from "viem";
import {
  allowanceContract,
  confidentialBalanceOfContract,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  nameContract,
  supportsInterfaceContract,
  symbolContract,
  underlyingContract,
} from "../contracts";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner, GenericStorage } from "../types";

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Configuration for constructing a {@link ReadonlyToken}. */
export interface ReadonlyTokenConfig {
  /** Address of the confidential token contract. */
  address: Address;
  /** Wallet signer for read calls. */
  signer: GenericSigner;
  /** Storage backend (kept for downstream read helpers; unused after SDK-34). */
  storage: GenericStorage;
  /** Optional structured event listener for debugging and telemetry. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * Read-only interface for a confidential token.
 * Provider-based reads only: metadata, handle lookup, ERC-165 support checks.
 * Does not require a wrapper, relayer, or credentials.
 *
 * For decrypt operations (balanceOf, decryptBalance, decryptHandles,
 * decryptBalanceAs), credential management (allow, isAllowed, revoke), or
 * delegation queries (isDelegated, getDelegationExpiry), use {@link Token}.
 */
export class ReadonlyToken {
  readonly signer: GenericSigner;
  readonly address: Address;
  readonly storage: GenericStorage;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: ReadonlyTokenConfig) {
    this.signer = config.signer;
    this.address = getAddress(config.address);
    this.storage = config.storage;
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

  protected async readConfidentialBalanceOf(owner: Address): Promise<Handle> {
    return (await this.signer.readContract(
      confidentialBalanceOfContract(this.address, owner),
    )) as Handle;
  }

  isZeroHandle(handle: string): handle is typeof ZERO_HANDLE | `0x` {
    return handle === ZERO_HANDLE || handle === "0x";
  }
}
