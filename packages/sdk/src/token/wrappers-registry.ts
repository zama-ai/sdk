import { type Address, getAddress } from "viem";
import {
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  getTokenPairContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  isConfidentialTokenValidContract,
  type TokenWrapperPair,
} from "../contracts";
import { DefaultConfigs } from "../relayer/relayer-utils";
import { ConfigurationError } from "./errors";
import type { GenericSigner } from "./token.types";

/** Default wrappers registry addresses extracted from built-in network configs. */
export const DefaultWrappersRegistryAddresses: Record<number, Address> = Object.fromEntries(
  Object.entries(DefaultConfigs)
    .filter(([, cfg]) => cfg.wrappersRegistryAddress !== undefined)
    .map(([chainId, cfg]) => [Number(chainId), cfg.wrappersRegistryAddress]),
) as Record<number, Address>;

/** Configuration for {@link WrappersRegistry}. */
export interface WrappersRegistryConfig {
  /** The connected wallet signer. Must satisfy the full `GenericSigner` interface. */
  signer: GenericSigner;
  /**
   * Per-chain registry address overrides, merged on top of
   * {@link DefaultWrappersRegistryAddresses}. Use this to supply a registry
   * address for custom or local chains (e.g. Hardhat).
   *
   * @example
   * ```ts
   * new WrappersRegistry({
   *   signer,
   *   wrappersRegistryAddresses: { [31337]: "0xYourHardhatRegistry" },
   * });
   * ```
   */
  wrappersRegistryAddresses?: Record<number, Address>;
}

/**
 * High-level interface for the on-chain token wrappers registry.
 *
 * Uses the connected signer to resolve the correct registry contract
 * address for the current chain and exposes typed read helpers for
 * every registry query.
 *
 * @example
 * ```ts
 * const registry = new WrappersRegistry({ signer });
 * const pairs = await registry.getTokenPairs();
 * const [found, cToken] = await registry.getConfidentialTokenAddress(tokenAddress);
 * ```
 */
export class WrappersRegistry {
  readonly signer: GenericSigner;
  readonly #addresses: Record<number, Address>;

  constructor(config: WrappersRegistryConfig) {
    this.signer = config.signer;
    this.#addresses = {
      ...DefaultWrappersRegistryAddresses,
      ...config.wrappersRegistryAddresses,
    };
  }

  /**
   * Resolve the registry contract address for the current chain.
   *
   * Priority: `wrappersRegistryAddresses[chainId]` \> built-in default.
   *
   * @returns The registry contract address for the connected chain.
   * @throws {@link ConfigurationError} if no address is configured for the chain.
   *
   * @example
   * ```ts
   * const addr = await registry.getRegistryAddress();
   * ```
   */
  async getRegistryAddress(): Promise<Address> {
    const chainId = await this.signer.getChainId();
    const address = this.#addresses[chainId];

    if (!address) {
      throw new ConfigurationError(
        `No wrappers registry address configured for chain ${chainId}.\n` +
          `Pass a wrappersRegistryAddresses entry for this chain.`,
      );
    }

    return address;
  }

  /**
   * Fetch all token wrapper pairs from the registry.
   *
   * @returns All registered `TokenWrapperPair` entries.
   *
   * @example
   * ```ts
   * const pairs = await registry.getTokenPairs();
   * for (const { tokenAddress, confidentialTokenAddress, isValid } of pairs) {
   *   console.log(tokenAddress, "→", confidentialTokenAddress, isValid);
   * }
   * ```
   */
  async getTokenPairs(): Promise<readonly TokenWrapperPair[]> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(getTokenPairsContract(registry));
  }

  /**
   * Get the total number of token wrapper pairs.
   *
   * @returns The count as a bigint.
   *
   * @example
   * ```ts
   * const count = await registry.getTokenPairsLength();
   * ```
   */
  async getTokenPairsLength(): Promise<bigint> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(getTokenPairsLengthContract(registry));
  }

  /**
   * Fetch a range of token wrapper pairs (paginated).
   *
   * @param fromIndex - Start index (inclusive).
   * @param toIndex - End index.
   * @returns The slice of `TokenWrapperPair` entries.
   *
   * @example
   * ```ts
   * const page = await registry.getTokenPairsSlice(0n, 10n);
   * ```
   */
  async getTokenPairsSlice(
    fromIndex: bigint,
    toIndex: bigint,
  ): Promise<readonly TokenWrapperPair[]> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(getTokenPairsSliceContract(registry, fromIndex, toIndex));
  }

  /**
   * Fetch a single token wrapper pair by index.
   *
   * @param index - Zero-based pair index.
   * @returns The `TokenWrapperPair` at that index.
   *
   * @example
   * ```ts
   * const pair = await registry.getTokenPair(0n);
   * ```
   */
  async getTokenPair(index: bigint): Promise<TokenWrapperPair> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(getTokenPairContract(registry, index));
  }

  /**
   * Look up the confidential token address for a given plain ERC-20 token.
   *
   * @param tokenAddress - The plain ERC-20 token address.
   * @returns A tuple `[found, confidentialTokenAddress]`.
   *
   * @example
   * ```ts
   * const [found, cToken] = await registry.getConfidentialTokenAddress("0xUSDC");
   * if (found) {
   *   const token = sdk.createToken(cToken);
   * }
   * ```
   */
  async getConfidentialTokenAddress(tokenAddress: Address): Promise<readonly [boolean, Address]> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(
      getConfidentialTokenAddressContract(registry, getAddress(tokenAddress)),
    );
  }

  /**
   * Reverse lookup — find the plain ERC-20 for a given confidential token.
   *
   * @param confidentialTokenAddress - The confidential token address.
   * @returns A tuple `[found, tokenAddress]`.
   *
   * @example
   * ```ts
   * const [found, plainToken] = await registry.getTokenAddress("0xcUSDC");
   * ```
   */
  async getTokenAddress(confidentialTokenAddress: Address): Promise<readonly [boolean, Address]> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(
      getTokenAddressContract(registry, getAddress(confidentialTokenAddress)),
    );
  }

  /**
   * Check whether a confidential token is registered and valid.
   *
   * @param confidentialTokenAddress - The confidential token address to check.
   * @returns `true` if the token is a known valid wrapper in the registry.
   *
   * @example
   * ```ts
   * if (await registry.isConfidentialTokenValid("0xcUSDC")) {
   *   // Token is a known valid wrapper
   * }
   * ```
   */
  async isConfidentialTokenValid(confidentialTokenAddress: Address): Promise<boolean> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(
      isConfidentialTokenValidContract(registry, getAddress(confidentialTokenAddress)),
    );
  }
}
