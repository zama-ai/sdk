import { inferredTotalSupplyContract, totalSupplyContract } from "../contracts";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import { detectWrapperInterfaceVersion } from "./wrapper-interface-version";
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
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      // ERC-165 detection adds one or two RPC calls per refetch, which is acceptable
      // while both legacy and upgraded wrappers coexist. Remove this branch once
      // all supported wrappers expose `inferredTotalSupply()`.
      const version = await detectWrapperInterfaceVersion(signer, keyTokenAddress);
      if (version === "upgraded") {
        return signer.readContract(inferredTotalSupplyContract(keyTokenAddress));
      }
      return signer.readContract(totalSupplyContract(keyTokenAddress));
    },
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
