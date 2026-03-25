import { type Address, getAddress } from "viem";
import type { EnrichedTokenWrapperPair, PaginatedResult, TokenWrapperPair } from "../contracts";
import {
  decimalsContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  getTokenPairContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  isConfidentialTokenValidContract,
  nameContract,
  symbolContract,
  totalSupplyContract,
} from "../contracts";
import { DefaultConfigs } from "../relayer/relayer-utils";
import { ConfigurationError } from "../errors/relayer";
import type { GenericSigner } from "../types/signer";

/** Default wrappers registry addresses extracted from built-in network configs. */
export const DefaultRegistryAddresses: Record<number, Address> = Object.fromEntries(
  Object.entries(DefaultConfigs)
    .filter(([, cfg]) => cfg.registryAddress !== undefined)
    .map(([chainId, cfg]) => [Number(chainId), cfg.registryAddress]),
) as Record<number, Address>;

/** Default page size for {@link WrappersRegistry.listPairs}. */
const DEFAULT_PAGE_SIZE = 100;

/** Default registry TTL in seconds (24 hours). */
const DEFAULT_REGISTRY_TTL = 86400;

/** Configuration for {@link WrappersRegistry}. */
export interface WrappersRegistryConfig {
  /** The connected wallet signer. Must satisfy the full `GenericSigner` interface. */
  signer: GenericSigner;
  /**
   * Per-chain registry address overrides, merged on top of
   * {@link DefaultRegistryAddresses}. Use this to supply a registry
   * address for custom or local chains (e.g. Hardhat).
   *
   * @example
   * ```ts
   * new WrappersRegistry({
   *   signer,
   *   registryAddresses: { [31337]: "0xYourHardhatRegistry" },
   * });
   * ```
   */
  registryAddresses?: Record<number, Address>;
  /**
   * How long cached registry results remain valid, in seconds.
   * Default: `86400` (24 hours). Consistent with `keypairTTL`/`sessionTTL`.
   */
  registryTTL?: number;
}

/** Options for {@link WrappersRegistry.listPairs}. */
export interface ListPairsOptions {
  /** Page number (1-indexed). Default: `1`. */
  page?: number;
  /** Number of items per page. Default: `100`. */
  pageSize?: number;
  /**
   * When `true`, fetches on-chain metadata (name, symbol, decimals) for both
   * the ERC-20 and confidential token, plus totalSupply for the ERC-20.
   * Default: `false`.
   */
  metadata?: boolean;
}

/** Cache entry with expiry timestamp. */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * High-level interface for the on-chain token wrappers registry.
 *
 * Uses the connected signer to resolve the correct registry contract
 * address for the current chain and exposes typed read helpers for
 * every registry query. Results are cached in memory with a
 * configurable TTL (default 24 hours).
 *
 * @example
 * ```ts
 * const registry = new WrappersRegistry({ signer });
 *
 * // Paginated listing
 * const page1 = await registry.listPairs({ page: 1, pageSize: 20 });
 *
 * // Structured lookups
 * const result = await registry.getConfidentialToken(erc20Address);
 * if (result) console.log(result.confidentialTokenAddress);
 *
 * // Force refresh
 * registry.refresh();
 * ```
 */
export class WrappersRegistry {
  readonly signer: GenericSigner;
  readonly #addresses: Record<number, Address>;
  readonly #ttlMs: number;
  readonly #cache = new Map<string, CacheEntry<unknown>>();

  constructor(config: WrappersRegistryConfig) {
    this.signer = config.signer;
    this.#addresses = {
      ...DefaultRegistryAddresses,
      ...config.registryAddresses,
    };
    this.#ttlMs = (config.registryTTL ?? DEFAULT_REGISTRY_TTL) * 1000;
  }

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  #getCached<T>(key: string): T | undefined {
    const entry = this.#cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.#cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  #setCached<T>(key: string, data: T): T {
    this.#cache.set(key, { data, expiresAt: Date.now() + this.#ttlMs });
    return data;
  }

  /**
   * Force-invalidate the in-memory cache. The next call to any read method
   * will fetch fresh data from the chain.
   */
  refresh(): void {
    this.#cache.clear();
  }

  /**
   * The cache TTL in milliseconds.
   * Exposed so query option factories can set a matching `staleTime`.
   */
  get ttlMs(): number {
    return this.#ttlMs;
  }

  // ---------------------------------------------------------------------------
  // Registry address resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve the registry contract address for the current chain.
   *
   * Priority: `registryAddresses[chainId]` \> built-in default.
   *
   * @returns The registry contract address for the connected chain.
   * @throws {@link ConfigurationError} if no address is configured for the chain.
   */
  async getRegistryAddress(): Promise<Address> {
    const chainId = await this.signer.getChainId();
    const address = this.#addresses[chainId];

    if (!address) {
      throw new ConfigurationError(
        `No wrappers registry address configured for chain ${chainId}.\n` +
          `Pass a registryAddresses entry for this chain.`,
      );
    }

    return address;
  }

  // ---------------------------------------------------------------------------
  // Paginated listing (SDK-49 § 2)
  // ---------------------------------------------------------------------------

  /**
   * List token wrapper pairs with page-based pagination.
   *
   * Internally maps to `getTokenConfidentialTokenPairsSlice` on-chain.
   *
   * @param options - Pagination and enrichment options.
   * @returns A {@link PaginatedResult} of pairs.
   *
   * @example
   * ```ts
   * const result = await registry.listPairs({ page: 1, pageSize: 20 });
   * console.log(`${result.total} pairs, showing page ${result.page}`);
   *
   * // With on-chain metadata
   * const withMeta = await registry.listPairs({ metadata: true, pageSize: 10 });
   * for (const pair of withMeta.items) {
   *   console.log(pair.underlying.symbol, "→", pair.confidential.symbol);
   * }
   * ```
   */
  async listPairs(
    options: ListPairsOptions = {},
  ): Promise<PaginatedResult<TokenWrapperPair | EnrichedTokenWrapperPair>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const metadata = options.metadata ?? false;

    const registry = await this.getRegistryAddress();

    // Fetch total (cached)
    const totalCacheKey = `total:${registry}`;
    let total = this.#getCached<number>(totalCacheKey);
    if (total === undefined) {
      const raw = await this.signer.readContract(getTokenPairsLengthContract(registry));
      total = this.#setCached(totalCacheKey, Number(raw));
    }

    // Compute slice indices
    const fromIndex = BigInt((page - 1) * pageSize);
    const toIndex = fromIndex + BigInt(pageSize);

    // Fetch slice (cached)
    const sliceCacheKey = `slice:${registry}:${fromIndex}:${toIndex}`;
    let items = this.#getCached<TokenWrapperPair[]>(sliceCacheKey);
    if (items === undefined) {
      const raw = await this.signer.readContract(
        getTokenPairsSliceContract(registry, fromIndex, toIndex),
      );
      items = this.#setCached(sliceCacheKey, [...raw]);
    }

    if (!metadata) {
      return { items, total, page, pageSize };
    }

    // Enrich with on-chain metadata
    const metadataCacheKey = `metadata:${registry}:${fromIndex}:${toIndex}`;
    let metadataItems = this.#getCached<EnrichedTokenWrapperPair[]>(metadataCacheKey);
    if (metadataItems === undefined) {
      metadataItems = this.#setCached(
        metadataCacheKey,
        await Promise.all(items.map((pair) => this.#enrichPair(pair))),
      );
    }

    return { items: metadataItems, total, page, pageSize };
  }

  async #enrichPair(pair: TokenWrapperPair): Promise<EnrichedTokenWrapperPair> {
    const [uName, uSymbol, uDecimals, uTotalSupply, cName, cSymbol, cDecimals] = await Promise.all([
      this.signer.readContract(nameContract(pair.tokenAddress)) as Promise<string>,
      this.signer.readContract(symbolContract(pair.tokenAddress)) as Promise<string>,
      this.signer.readContract(decimalsContract(pair.tokenAddress)) as Promise<number>,
      this.signer.readContract(totalSupplyContract(pair.tokenAddress)) as Promise<bigint>,
      this.signer.readContract(nameContract(pair.confidentialTokenAddress)) as Promise<string>,
      this.signer.readContract(symbolContract(pair.confidentialTokenAddress)) as Promise<string>,
      this.signer.readContract(decimalsContract(pair.confidentialTokenAddress)) as Promise<number>,
    ]);

    return {
      ...pair,
      underlying: {
        name: uName,
        symbol: uSymbol,
        decimals: uDecimals,
        totalSupply: uTotalSupply,
      },
      confidential: { name: cName, symbol: cSymbol, decimals: cDecimals },
    };
  }

  // ---------------------------------------------------------------------------
  // Structured single-pair lookups (SDK-49 § 2)
  // ---------------------------------------------------------------------------

  /**
   * Look up the confidential token for a given plain ERC-20 address.
   *
   * @param tokenAddress - The plain ERC-20 token address.
   * @returns The lookup result, or `null` if no pair is registered.
   *
   * @example
   * ```ts
   * const result = await registry.getConfidentialToken(usdcAddress);
   * if (result) {
   *   console.log(result.confidentialTokenAddress, result.isValid);
   * }
   * ```
   */
  async getConfidentialToken(
    tokenAddress: Address,
  ): Promise<{ confidentialTokenAddress: Address; isValid: boolean } | null> {
    const registry = await this.getRegistryAddress();
    const normalized = getAddress(tokenAddress);

    const cacheKey = `ct:${registry}:${normalized}`;
    const cached = this.#getCached<{
      confidentialTokenAddress: Address;
      isValid: boolean;
    } | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const [found, confidentialTokenAddress] = await this.signer.readContract(
      getConfidentialTokenAddressContract(registry, normalized),
    );

    if (!found) {
      return this.#setCached(cacheKey, null);
    }

    // Check validity via isConfidentialTokenValid
    const isValid = await this.signer.readContract(
      isConfidentialTokenValidContract(registry, confidentialTokenAddress),
    );

    return this.#setCached(cacheKey, { confidentialTokenAddress, isValid });
  }

  /**
   * Reverse lookup — find the plain ERC-20 for a given confidential token.
   *
   * @param confidentialTokenAddress - The confidential token address.
   * @returns The lookup result, or `null` if no pair is registered.
   *
   * @example
   * ```ts
   * const result = await registry.getUnderlyingToken(cUsdcAddress);
   * if (result) {
   *   console.log(result.tokenAddress, result.isValid);
   * }
   * ```
   */
  async getUnderlyingToken(
    confidentialTokenAddress: Address,
  ): Promise<{ tokenAddress: Address; isValid: boolean } | null> {
    const registry = await this.getRegistryAddress();
    const normalized = getAddress(confidentialTokenAddress);

    const cacheKey = `ut:${registry}:${normalized}`;
    const cached = this.#getCached<{
      tokenAddress: Address;
      isValid: boolean;
    } | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const [found, tokenAddress] = await this.signer.readContract(
      getTokenAddressContract(registry, normalized),
    );

    if (!found) {
      return this.#setCached(cacheKey, null);
    }

    const isValid = await this.signer.readContract(
      isConfidentialTokenValidContract(registry, normalized),
    );

    return this.#setCached(cacheKey, { tokenAddress, isValid });
  }

  // ---------------------------------------------------------------------------
  // Low-level pass-through methods (backward compatible)
  // ---------------------------------------------------------------------------

  /**
   * Fetch all token wrapper pairs from the registry.
   *
   * @returns All registered `TokenWrapperPair` entries.
   */
  async getTokenPairs(): Promise<readonly TokenWrapperPair[]> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(getTokenPairsContract(registry));
  }

  /**
   * Get the total number of token wrapper pairs.
   *
   * @returns The count as a bigint.
   */
  async getTokenPairsLength(): Promise<bigint> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(getTokenPairsLengthContract(registry));
  }

  /**
   * Fetch a range of token wrapper pairs (paginated by index).
   *
   * @param fromIndex - Start index (inclusive).
   * @param toIndex - End index.
   * @returns The slice of `TokenWrapperPair` entries.
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
   */
  async isConfidentialTokenValid(confidentialTokenAddress: Address): Promise<boolean> {
    const registry = await this.getRegistryAddress();
    return this.signer.readContract(
      isConfidentialTokenValidContract(registry, getAddress(confidentialTokenAddress)),
    );
  }
}
