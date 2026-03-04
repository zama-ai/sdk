import { totalSupplyContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface TotalSupplyQueryConfig {
  query?: Record<string, unknown>;
}

export function totalSupplyQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: TotalSupplyQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.totalSupply.token>, bigint> {
  const queryKey = zamaQueryKeys.totalSupply.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      return signer.readContract<bigint>(totalSupplyContract(keyTokenAddress as Address));
    },
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
