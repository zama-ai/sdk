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
  EnrichedTokenWrapperPair,
  PaginatedResult,
} from "../contracts/wrappers-registry";
import { WrappersRegistry } from "../token/wrappers-registry";
import type { GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface WrappersRegistryQueryConfig {
  wrappersRegistryAddress: Address | undefined;
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
  const enabled = Boolean(config.wrappersRegistryAddress) && config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPairs(
    config.wrappersRegistryAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress }] = context.queryKey;
      return signer.readContract(getTokenPairsContract(wrappersRegistryAddress));
    },
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
    Boolean(config.wrappersRegistryAddress) &&
    Boolean(config.tokenAddress) &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.confidentialTokenAddress(
    config.wrappersRegistryAddress ?? zeroAddress,
    config.tokenAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress, tokenAddress }] = context.queryKey;
      return signer.readContract(
        getConfidentialTokenAddressContract(wrappersRegistryAddress, tokenAddress),
      );
    },
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
    Boolean(config.wrappersRegistryAddress) &&
    Boolean(config.confidentialTokenAddress) &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenAddress(
    config.wrappersRegistryAddress ?? zeroAddress,
    config.confidentialTokenAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress, confidentialTokenAddress }] = context.queryKey;
      return signer.readContract(
        getTokenAddressContract(wrappersRegistryAddress, confidentialTokenAddress),
      );
    },
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
  const enabled = Boolean(config.wrappersRegistryAddress) && config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPairsLength(
    config.wrappersRegistryAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress }] = context.queryKey;
      return signer.readContract(getTokenPairsLengthContract(wrappersRegistryAddress));
    },
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
    Boolean(config.wrappersRegistryAddress) &&
    config.fromIndex !== undefined &&
    config.toIndex !== undefined &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPairsSlice(
    config.wrappersRegistryAddress ?? zeroAddress,
    String(config.fromIndex ?? 0n),
    String(config.toIndex ?? 0n),
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress, fromIndex, toIndex }] = context.queryKey;
      return signer.readContract(
        getTokenPairsSliceContract(wrappersRegistryAddress, BigInt(fromIndex), BigInt(toIndex)),
      );
    },
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
    Boolean(config.wrappersRegistryAddress) &&
    config.index !== undefined &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.tokenPair(
    config.wrappersRegistryAddress ?? zeroAddress,
    String(config.index ?? 0n),
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress, index }] = context.queryKey;
      return signer.readContract(getTokenPairContract(wrappersRegistryAddress, BigInt(index)));
    },
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
    Boolean(config.wrappersRegistryAddress) &&
    Boolean(config.confidentialTokenAddress) &&
    config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.isConfidentialTokenValid(
    config.wrappersRegistryAddress ?? zeroAddress,
    config.confidentialTokenAddress ?? zeroAddress,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { wrappersRegistryAddress, confidentialTokenAddress }] = context.queryKey;
      return signer.readContract(
        isConfidentialTokenValidContract(wrappersRegistryAddress, confidentialTokenAddress),
      );
    },
    enabled,
  };
}

export interface ListPairsQueryConfig extends WrappersRegistryQueryConfig {
  page?: number;
  pageSize?: number;
  enriched?: boolean;
  registryTTL?: number;
}

export function listPairsQueryOptions(
  signer: GenericSigner,
  config: ListPairsQueryConfig,
): QueryFactoryOptions<
  PaginatedResult<TokenWrapperPair | EnrichedTokenWrapperPair>,
  Error,
  PaginatedResult<TokenWrapperPair | EnrichedTokenWrapperPair>,
  ReturnType<typeof zamaQueryKeys.wrappersRegistry.listPairs>
> {
  const page = config.page ?? 1;
  const pageSize = config.pageSize ?? 100;
  const enriched = config.enriched ?? false;
  const enabled = Boolean(config.wrappersRegistryAddress) && config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.wrappersRegistry.listPairs(
    config.wrappersRegistryAddress ?? zeroAddress,
    page,
    pageSize,
    enriched,
  );
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async () => {
      const registry = new WrappersRegistry({
        signer,
        wrappersRegistryAddresses: config.wrappersRegistryAddress
          ? { [await signer.getChainId()]: config.wrappersRegistryAddress }
          : undefined,
        registryTTL: config.registryTTL,
      });
      return registry.listPairs({ page, pageSize, enriched });
    },
    enabled,
  };
}
