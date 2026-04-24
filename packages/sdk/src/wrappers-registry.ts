import { type Address, getAddress, zeroAddress } from "viem";
import type { TokenWrapperPairWithMetadata, PaginatedResult, TokenWrapperPair } from "./contracts";
import {
  decimalsContract,
  erc20TotalSupplyContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  getTokenPairContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  isConfidentialTokenValidContract,
  nameContract,
  symbolContract,
} from "./contracts";
import { ConfigurationError } from "./errors/relayer";
import { hoodiCleartextConfig } from "./relayer/cleartext";
import { MainnetConfig, SepoliaConfig } from "./relayer/relayer-utils";
import type { GenericProvider } from "./types/provider";

/**
 * Default wrappers registry addresses for known chains.
 * Only includes chains where a registry is deployed (excludes Hardhat).
 */
export const DefaultRegistryAddresses: Record<number, Address> = {
  [MainnetConfig.chainId]: MainnetConfig.registryAddress,
  [SepoliaConfig.chainId]: SepoliaConfig.registryAddress,
  [hoodiCleartextConfig.chainId]: hoodiCleartextConfig.registryAddress,
};

/** Default page size for {@link WrappersRegistry.listPairs}. */
const DEFAULT_PAGE_SIZE = 100;

/** Default registry TTL in seconds (24 hours). */
const DEFAULT_REGISTRY_TTL = 86400;

/** Configuration for {@link WrappersRegistry}. */
export interface WrappersRegistryConfig {
  /** Read-only chain provider used for every registry lookup. */
  provider: GenericProvider;
  /**
   * Per-chain registry address overrides, merged on top of
   * {@link DefaultRegistryAddresses}. Use this to supply a registry
   * address for custom or local chains (e.g. Hardhat).
   *
   * @example
   * ```ts
   * new WrappersRegistry({
   *   provider,
   *   registryAddresses: { [31337]: "0xYourHardhatRegistry" },
   * });
   * ```
   */
  registryAddresses?: Record<number, Address>;
  /**
   * How long cached registry results remain valid, in seconds.
   * Default: `86400` (24 hours).
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

/** Shorter TTL for negative lookups (5 minutes) so newly registered tokens are discoverable quickly. */
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

/** Cache entry with expiry timestamp. */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * High-level interface for the on-chain token wrappers registry.
 *
 * Uses the configured {@link GenericProvider} to resolve the correct registry
 * contract address for the current chain and exposes typed read helpers for
 * every registry query. Results are cached in memory with a configurable TTL
 * (default 24 hours).
 *
 * @example
 * ```ts
 * const registry = new WrappersRegistry({ provider });
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
  readonly provider: GenericProvider;
  readonly #addresses: Record<number, Address>;
  readonly #ttlMs: number;
  readonly #cache = new Map<string, CacheEntry<unknown>>();

  constructor(config: WrappersRegistryConfig) {
    this.provider = config.provider;
    this.#addresses = Object.assign({}, DefaultRegistryAddresses, config.registryAddresses);
    this.#ttlMs = (config.registryTTL ?? DEFAULT_REGISTRY_TTL) * 1000;
  }

  /**
   * Synchronous lookup of the registry address for a given chain ID.
   * Returns `undefined` if no address is configured for that chain.
   */
  getAddress(chainId: number): Address | undefined {
    return this.#addresses[chainId];
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

  #setCached<T>(key: string, data: T, ttlMs = this.#ttlMs): T {
    this.#cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
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
    const chainId = await this.provider.getChainId();
    const address = this.#addresses[chainId];

    if (!address) {
      throw new ConfigurationError(
        `No wrappers registry address configured for chain ${chainId}.\n` +
          `Pass a registryAddresses entry for this chain.`,
      );
    }

    return getAddress(address);
  }

  // ---------------------------------------------------------------------------
  // Paginated listing
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
    options: ListPairsOptions & { metadata: true },
  ): Promise<PaginatedResult<TokenWrapperPairWithMetadata>>;
  async listPairs(options?: ListPairsOptions): Promise<PaginatedResult<TokenWrapperPair>>;
  async listPairs(
    options: ListPairsOptions = {},
  ): Promise<PaginatedResult<TokenWrapperPair | TokenWrapperPairWithMetadata>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const metadata = options.metadata ?? false;

    if (page < 1) {
      throw new ConfigurationError(`page must be >= 1, got ${page}`);
    }
    if (pageSize < 1) {
      throw new ConfigurationError(`pageSize must be >= 1, got ${pageSize}`);
    }

    const registry = await this.getRegistryAddress();

    // Fetch total (cached)
    const totalCacheKey = `total:${registry}`;
    let total = this.#getCached<number>(totalCacheKey);
    if (total === undefined) {
      const raw = await this.provider.readContract(getTokenPairsLengthContract(registry));
      total = this.#setCached(totalCacheKey, Number(raw));
    }

    // Compute slice indices, clamping toIndex to total
    const fromIndex = BigInt((page - 1) * pageSize);
    const clampedToIndex =
      fromIndex + BigInt(pageSize) > BigInt(total) ? BigInt(total) : fromIndex + BigInt(pageSize);

    // Page beyond total — return empty
    if (fromIndex >= BigInt(total)) {
      return { items: [], total, page, pageSize };
    }

    // Fetch slice (cached)
    const sliceCacheKey = `slice:${registry}:${fromIndex}:${clampedToIndex}`;
    let items = this.#getCached<TokenWrapperPair[]>(sliceCacheKey);
    if (items === undefined) {
      const raw = await this.provider.readContract(
        getTokenPairsSliceContract(registry, fromIndex, clampedToIndex),
      );
      items = this.#setCached(sliceCacheKey, [...raw]);
    }

    if (!metadata) {
      return { items, total, page, pageSize };
    }

    // Enrich with on-chain metadata (resilient — individual failures don't break the batch)
    const metadataCacheKey = `metadata:${registry}:${fromIndex}:${clampedToIndex}`;
    let metadataItems = this.#getCached<TokenWrapperPairWithMetadata[]>(metadataCacheKey);
    if (metadataItems === undefined) {
      const settled = await Promise.allSettled(items.map((pair) => this.#pairWithMetadata(pair)));
      const hasFailures = settled.some((r) => r.status === "rejected");
      const enriched = settled.map((result, i) =>
        result.status === "fulfilled"
          ? result.value
          : Object.assign({}, items[i], {
              metadataFailed: true as const,
              underlying: {
                name: "Unknown",
                symbol: "???",
                decimals: 0,
                totalSupply: 0n,
              },
              confidential: { name: "Unknown", symbol: "???", decimals: 0 },
            }),
      );
      // Use negative cache TTL when any metadata fetch failed so retries happen sooner
      metadataItems = this.#setCached(
        metadataCacheKey,
        enriched,
        hasFailures ? NEGATIVE_CACHE_TTL_MS : undefined,
      );
    }

    return { items: metadataItems, total, page, pageSize };
  }

  async #pairWithMetadata(pair: TokenWrapperPair): Promise<TokenWrapperPairWithMetadata> {
    const [uName, uSymbol, uDecimals, uTotalSupply, cName, cSymbol, cDecimals] = await Promise.all([
      this.provider.readContract(nameContract(pair.tokenAddress)),
      this.provider.readContract(symbolContract(pair.tokenAddress)),
      this.provider.readContract(decimalsContract(pair.tokenAddress)),
      this.provider.readContract(erc20TotalSupplyContract(pair.tokenAddress)),
      this.provider.readContract(nameContract(pair.confidentialTokenAddress)),
      this.provider.readContract(symbolContract(pair.confidentialTokenAddress)),
      this.provider.readContract(decimalsContract(pair.confidentialTokenAddress)),
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
  // Structured single-pair lookups
  // ---------------------------------------------------------------------------

  /**
   * Look up the confidential token for a given plain ERC-20 address.
   *
   * @param tokenAddress - The plain ERC-20 token address.
   * @returns The lookup result, or `null` if the token has never been registered.
   *   **Note:** revoked tokens (registered then invalidated) return a non-null result
   *   with `isValid: false`. Check `result.isValid` explicitly rather than using
   *   `if (result)` to guard against processing revoked tokens.
   *
   * @example
   * ```ts
   * const result = await registry.getConfidentialToken(usdcAddress);
   * if (result?.isValid) {
   *   console.log(result.confidentialTokenAddress);
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

    const [isValid, confidentialTokenAddress] = await this.provider.readContract(
      getConfidentialTokenAddressContract(registry, normalized),
    );

    // Zero address means the token is not registered at all (never seen by the registry).
    // A non-zero address with isValid=false means it was registered but later revoked.
    if (confidentialTokenAddress === zeroAddress) {
      return this.#setCached(cacheKey, null, NEGATIVE_CACHE_TTL_MS);
    }

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

    const [isValid, tokenAddress] = await this.provider.readContract(
      getTokenAddressContract(registry, normalized),
    );

    // Zero address means the confidential token is not registered at all.
    // A non-zero address with isValid=false means it was registered but later revoked.
    if (tokenAddress === zeroAddress) {
      return this.#setCached(cacheKey, null, NEGATIVE_CACHE_TTL_MS);
    }

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
    return this.provider.readContract(getTokenPairsContract(registry));
  }

  /**
   * Get the total number of token wrapper pairs.
   *
   * @returns The count as a bigint.
   */
  async getTokenPairsLength(): Promise<bigint> {
    const registry = await this.getRegistryAddress();
    return this.provider.readContract(getTokenPairsLengthContract(registry));
  }

  /**
   * Fetch a range of token wrapper pairs (paginated by index).
   *
   * @param fromIndex - Start index (inclusive).
   * @param toIndex - End index (exclusive).
   * @returns The slice of `TokenWrapperPair` entries.
   */
  async getTokenPairsSlice(
    fromIndex: bigint,
    toIndex: bigint,
  ): Promise<readonly TokenWrapperPair[]> {
    const registry = await this.getRegistryAddress();
    return this.provider.readContract(getTokenPairsSliceContract(registry, fromIndex, toIndex));
  }

  /**
   * Fetch a single token wrapper pair by index.
   *
   * @param index - Zero-based pair index.
   * @returns The `TokenWrapperPair` at that index.
   */
  async getTokenPair(index: bigint): Promise<TokenWrapperPair> {
    const registry = await this.getRegistryAddress();
    return this.provider.readContract(getTokenPairContract(registry, index));
  }

  /**
   * Look up the confidential token address for a given plain ERC-20 token.
   *
   * @param tokenAddress - The plain ERC-20 token address.
   * @returns A tuple `[isValid, confidentialTokenAddress]`. `isValid` is `true` only for a
   *   registered, non-revoked wrapper. The address is the zero address when no pair is registered.
   *   A non-zero address with `isValid=false` means the wrapper was registered but later revoked.
   */
  async getConfidentialTokenAddress(tokenAddress: Address): Promise<readonly [boolean, Address]> {
    const registry = await this.getRegistryAddress();
    return this.provider.readContract(
      getConfidentialTokenAddressContract(registry, getAddress(tokenAddress)),
    );
  }

  /**
   * Reverse lookup — find the plain ERC-20 for a given confidential token.
   *
   * @param confidentialTokenAddress - The confidential token address.
   * @returns A tuple `[isValid, tokenAddress]`. `isValid` is `true` only for a registered,
   *   non-revoked wrapper. The address is the zero address when no pair is registered.
   *   A non-zero address with `isValid=false` means the wrapper was registered but later revoked.
   */
  async getTokenAddress(confidentialTokenAddress: Address): Promise<readonly [boolean, Address]> {
    const registry = await this.getRegistryAddress();
    return this.provider.readContract(
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
    return this.provider.readContract(
      isConfidentialTokenValidContract(registry, getAddress(confidentialTokenAddress)),
    );
  }
}
