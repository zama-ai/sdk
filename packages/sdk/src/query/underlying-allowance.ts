import { allowanceContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface UnderlyingAllowanceQueryConfig {
  owner?: Address;
  wrapperAddress: Address;
  query?: Record<string, unknown>;
}

export function underlyingAllowanceQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config: UnderlyingAllowanceQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.underlyingAllowance.scope>, bigint> {
  const ownerKey = config.owner ?? "";
  const queryKey = zamaQueryKeys.underlyingAllowance.scope(
    tokenAddress,
    ownerKey,
    config.wrapperAddress,
  );

  return {
    queryKey,
    queryFn: async (context) => {
      const [
        ,
        { tokenAddress: keyTokenAddress, owner: keyOwner, wrapperAddress: keyWrapperAddress },
      ] = context.queryKey;
      return signer.readContract<bigint>(
        allowanceContract(
          keyTokenAddress as Address,
          keyOwner as Address,
          keyWrapperAddress as Address,
        ),
      );
    },
    staleTime: 30_000,
    enabled: Boolean(ownerKey) && config.query?.enabled !== false,
    ...filterQueryOptions(config.query ?? {}),
  };
}
