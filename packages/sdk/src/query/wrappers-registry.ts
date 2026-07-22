import { type Address, zeroAddress } from "viem";
import {
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  getTokenPairContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  isConfidentialTokenValidContract,
} from "../contracts";
import type {
  TokenWrapperPair,
  TokenWrapperPairWithMetadata,
  PaginatedResult,
} from "../contracts/wrappers-registry";
import type { WrappersRegistry } from "../wrappers-registry";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

/** Base configuration shared by the wrappers-registry query option factories. */
export interface WrappersRegistryQueryConfig {
  /** Registry contract address for the current chain; used as a query key discriminator. */
  registryAddress: Address | undefined;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Builds TanStack Query options for reading all token wrapper pairs registered in the wrappers registry. */
export function tokenPairsQueryOptions(
  sdk: ZamaSDK,
  config: WrappersRegistryQueryConfig,
): QueryFactoryOptions<
  readonly TokenWrapperPair[],
  Error,
  readonly TokenWrapperPair[],
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.tokenPairs>
> {
  const enabled = Boolean(config.registryAddress) && config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPairs(config.registryAddress ?? zeroAddress);
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress }] = context.queryKey;
      return sdk.provider.readContract(getTokenPairsContract(registryAddress));
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Configuration for {@link confidentialTokenAddressQueryOptions}. */
export interface ConfidentialTokenAddressQueryConfig extends WrappersRegistryQueryConfig {
  /** Underlying ERC-20 token address whose confidential counterpart to look up. */
  tokenAddress?: Address;
}

/** Builds TanStack Query options for reading the confidential token address registered for a given underlying ERC-20 token. */
export function confidentialTokenAddressQueryOptions(
  sdk: ZamaSDK,
  config: ConfidentialTokenAddressQueryConfig,
): QueryFactoryOptions<
  readonly [boolean, Address],
  Error,
  readonly [boolean, Address],
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.confidentialTokenAddress>
> {
  const enabled =
    Boolean(config.registryAddress) &&
    Boolean(config.tokenAddress) &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.confidentialTokenAddress(
    config.registryAddress ?? zeroAddress,
    config.tokenAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress, tokenAddress }] = context.queryKey;
      return sdk.provider.readContract(
        getConfidentialTokenAddressContract(registryAddress, tokenAddress),
      );
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Configuration for {@link tokenAddressQueryOptions}. */
export interface TokenAddressQueryConfig extends WrappersRegistryQueryConfig {
  /** Confidential token address whose underlying ERC-20 counterpart to look up. */
  confidentialTokenAddress?: Address;
}

/** Builds TanStack Query options for reading the underlying ERC-20 token address registered for a given confidential token. */
export function tokenAddressQueryOptions(
  sdk: ZamaSDK,
  config: TokenAddressQueryConfig,
): QueryFactoryOptions<
  readonly [boolean, Address],
  Error,
  readonly [boolean, Address],
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.tokenAddress>
> {
  const enabled =
    Boolean(config.registryAddress) &&
    Boolean(config.confidentialTokenAddress) &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenAddress(
    config.registryAddress ?? zeroAddress,
    config.confidentialTokenAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress, confidentialTokenAddress }] = context.queryKey;
      return sdk.provider.readContract(
        getTokenAddressContract(registryAddress, confidentialTokenAddress),
      );
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Builds TanStack Query options for reading the total number of token wrapper pairs in the registry. */
export function tokenPairsLengthQueryOptions(
  sdk: ZamaSDK,
  config: WrappersRegistryQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.tokenPairsLength>
> {
  const enabled = Boolean(config.registryAddress) && config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPairsLength(
    config.registryAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress }] = context.queryKey;
      return sdk.provider.readContract(getTokenPairsLengthContract(registryAddress));
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Configuration for {@link tokenPairsSliceQueryOptions}. */
export interface TokenPairsSliceQueryConfig extends WrappersRegistryQueryConfig {
  /** Zero-based index of the first pair in the slice (inclusive). */
  fromIndex?: bigint;
  /** Index bounding the end of the slice. */
  toIndex?: bigint;
}

/** Builds TanStack Query options for reading a contiguous slice of the registry's token wrapper pairs. */
export function tokenPairsSliceQueryOptions(
  sdk: ZamaSDK,
  config: TokenPairsSliceQueryConfig,
): QueryFactoryOptions<
  readonly TokenWrapperPair[],
  Error,
  readonly TokenWrapperPair[],
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.tokenPairsSlice>
> {
  const enabled =
    Boolean(config.registryAddress) &&
    config.fromIndex !== undefined &&
    config.toIndex !== undefined &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPairsSlice(
    config.registryAddress ?? zeroAddress,
    String(config.fromIndex ?? 0n),
    String(config.toIndex ?? 0n),
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress, fromIndex, toIndex }] = context.queryKey;
      return sdk.provider.readContract(
        getTokenPairsSliceContract(registryAddress, BigInt(fromIndex), BigInt(toIndex)),
      );
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Configuration for {@link tokenPairQueryOptions}. */
export interface TokenPairQueryConfig extends WrappersRegistryQueryConfig {
  /** Zero-based index of the token wrapper pair to read. */
  index?: bigint;
}

/** Builds TanStack Query options for reading a single token wrapper pair by its index in the registry. */
export function tokenPairQueryOptions(
  sdk: ZamaSDK,
  config: TokenPairQueryConfig,
): QueryFactoryOptions<
  TokenWrapperPair,
  Error,
  TokenWrapperPair,
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.tokenPair>
> {
  const enabled =
    Boolean(config.registryAddress) &&
    config.index !== undefined &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPair(
    config.registryAddress ?? zeroAddress,
    String(config.index ?? 0n),
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress, index }] = context.queryKey;
      return sdk.provider.readContract(getTokenPairContract(registryAddress, BigInt(index)));
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Configuration for {@link isConfidentialTokenValidQueryOptions}. */
export interface IsConfidentialTokenValidQueryConfig extends WrappersRegistryQueryConfig {
  /** Confidential token address to validate against the registry. */
  confidentialTokenAddress?: Address;
}

/** Builds TanStack Query options for checking whether a confidential token is registered and valid in the registry. */
export function isConfidentialTokenValidQueryOptions(
  sdk: ZamaSDK,
  config: IsConfidentialTokenValidQueryConfig,
): QueryFactoryOptions<
  boolean,
  Error,
  boolean,
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.isConfidentialTokenValid>
> {
  const enabled =
    Boolean(config.registryAddress) &&
    Boolean(config.confidentialTokenAddress) &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.isConfidentialTokenValid(
    config.registryAddress ?? zeroAddress,
    config.confidentialTokenAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { registryAddress, confidentialTokenAddress }] = context.queryKey;
      return sdk.provider.readContract(
        isConfidentialTokenValidContract(registryAddress, confidentialTokenAddress),
      );
    },
    staleTime: sdk.registry.ttlMs,
    enabled,
  };
}

/** Configuration for {@link listPairsQueryOptions}. */
export interface ListPairsQueryConfig {
  /**
   * The registry address for this chain — used as a query key discriminator.
   * The registry instance already knows how to resolve the address for the
   * current chain; this field just keeps the TanStack Query cache isolated
   * per registry contract.
   */
  registryAddress: Address | undefined;
  /** 1-based page number to fetch; defaults to `1`. */
  page?: number;
  /** Number of pairs per page; defaults to `100`. */
  pageSize?: number;
  /** When `true`, resolve each pair's on-chain metadata; defaults to `false`. */
  metadata?: boolean;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for paginated listing of token wrapper pairs.
 *
 * Accepts a {@link WrappersRegistry} instance rather than a raw provider so that the
 * class-level TTL cache is shared across multiple `queryFn` executions. Pass
 * `sdk.registry` (the ZamaSDK lazy singleton) to ensure a single shared cache.
 */
export function listPairsQueryOptions(
  registry: WrappersRegistry,
  config: ListPairsQueryConfig,
): QueryFactoryOptions<
  PaginatedResult<TokenWrapperPair | TokenWrapperPairWithMetadata>,
  Error,
  PaginatedResult<TokenWrapperPair | TokenWrapperPairWithMetadata>,
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.listPairs>
> {
  const enabled = Boolean(config.registryAddress) && config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.listPairs(
    config.registryAddress ?? zeroAddress,
    config.page ?? 1,
    config.pageSize ?? 100,
    config.metadata ?? false,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { page, pageSize, metadata }] = context.queryKey;
      return registry.listPairs({ page, pageSize, metadata });
    },
    // Use the registry's own TTL so TanStack Query and the class-level cache
    // operate under the same freshness contract.
    staleTime: registry.ttlMs,
    enabled,
  };
}
