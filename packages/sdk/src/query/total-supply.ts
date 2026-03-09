import { totalSupplyContract } from "../contracts";
import type { GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

export interface TotalSupplyQueryConfig {
  query?: Record<string, unknown>;
}

export function totalSupplyQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: TotalSupplyQueryConfig,
): QueryFactoryOptions<bigint, Error, bigint, ReturnType<typeof zamaQueryKeys.totalSupply.token>> {
  const queryKey = zamaQueryKeys.totalSupply.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context: { queryKey: typeof queryKey }) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return signer.readContract(totalSupplyContract(keyTokenAddress));
    },
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
