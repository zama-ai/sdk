import { inferredTotalSupplyContract } from "../contracts";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

/** Configuration for {@link totalSupplyQueryOptions}. */
export interface TotalSupplyQueryConfig {
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Builds TanStack Query options for reading a token's total supply. */
export function totalSupplyQueryOptions(
  sdk: ZamaSDK,
  tokenAddress: Address,
  config?: TotalSupplyQueryConfig,
): QueryFactoryOptions<bigint, Error, bigint, ReturnType<typeof zamaQueryKeys.totalSupply.token>> {
  const queryKey = zamaQueryKeys.totalSupply.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return sdk.provider.readContract(inferredTotalSupplyContract(keyTokenAddress));
    },
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
