import { allowanceContract, underlyingContract } from "../contracts";
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
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.underlyingAllowance.scope>
> {
  const ownerKey = config.owner ?? "";
  const queryKey = zamaQueryKeys.underlyingAllowance.scope(
    tokenAddress,
    ownerKey,
    config.wrapperAddress,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context: { queryKey: typeof queryKey }) => {
      const [, { owner: keyOwner, wrapperAddress: keyWrapperAddress }] = context.queryKey;
      const underlying = await signer.readContract(
        underlyingContract(keyWrapperAddress as Address),
      );
      return signer.readContract(
        allowanceContract(underlying, keyOwner as Address, keyWrapperAddress as Address),
      );
    },
    staleTime: 30_000,
    enabled: Boolean(ownerKey) && config.query?.enabled !== false,
  };
}
