import type { Address } from "../utils/address";
import { zeroAddress } from "../utils/address";
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
import type { GenericSigner } from "../types/signer";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

/** Default registry TTL in milliseconds — matches {@link WrappersRegistry} default of 86400 s. */
const DEFAULT_STALE_TIME_MS = 86400 * 1000;

export interface WrappersRegistryQueryConfig {
  registryAddress: Address | undefined;
  query?: Record<string, unknown>;
}

export function tokenPairsQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(getTokenPairsContract(registryAddress));
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export interface ConfidentialTokenAddressQueryConfig extends WrappersRegistryQueryConfig {
  tokenAddress?: Address;
}

export function confidentialTokenAddressQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(
        getConfidentialTokenAddressContract(registryAddress, tokenAddress),
      );
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export interface TokenAddressQueryConfig extends WrappersRegistryQueryConfig {
  confidentialTokenAddress?: Address;
}

export function tokenAddressQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(
        getTokenAddressContract(registryAddress, confidentialTokenAddress),
      );
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export function tokenPairsLengthQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(getTokenPairsLengthContract(registryAddress));
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export interface TokenPairsSliceQueryConfig extends WrappersRegistryQueryConfig {
  fromIndex?: bigint;
  toIndex?: bigint;
}

export function tokenPairsSliceQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(
        getTokenPairsSliceContract(registryAddress, BigInt(fromIndex), BigInt(toIndex)),
      );
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export interface TokenPairQueryConfig extends WrappersRegistryQueryConfig {
  index?: bigint;
}

export function tokenPairQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(getTokenPairContract(registryAddress, BigInt(index)));
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export interface IsConfidentialTokenValidQueryConfig extends WrappersRegistryQueryConfig {
  confidentialTokenAddress?: Address;
}

export function isConfidentialTokenValidQueryOptions(
  signer: GenericSigner,
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
      return signer.readContract(
        isConfidentialTokenValidContract(registryAddress, confidentialTokenAddress),
      );
    },
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  };
}

export interface ListPairsQueryConfig {
  /**
   * The registry address for this chain — used as a query key discriminator.
   * The registry instance already knows how to resolve the address for the
   * current chain; this field just keeps the TanStack Query cache isolated
   * per registry contract.
   */
  registryAddress: Address | undefined;
  page?: number;
  pageSize?: number;
  metadata?: boolean;
  query?: Record<string, unknown>;
}

/**
 * Query options for paginated listing of token wrapper pairs.
 *
 * Accepts a {@link WrappersRegistry} instance rather than a raw signer so that the
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
