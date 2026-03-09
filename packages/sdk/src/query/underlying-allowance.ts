import { allowanceContract, underlyingContract } from "../contracts";
import type { GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

export interface UnderlyingAllowanceQueryConfig {
  owner?: Address;
  wrapperAddress?: Address;
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
  const ownerKey = config.owner;
  const wrapperAddressKey = config.wrapperAddress;
  const queryEnabled = config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.underlyingAllowance.scope(
    tokenAddress,
    ownerKey,
    wrapperAddressKey,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context: { queryKey: typeof queryKey }) => {
      const [, { owner: keyOwner, wrapperAddress: keyWrapperAddress }] = context.queryKey;
      if (!keyOwner) throw new Error("owner is required");
      if (!keyWrapperAddress) throw new Error("wrapperAddress is required");
      const underlying = await signer.readContract(underlyingContract(keyWrapperAddress));
      return signer.readContract(allowanceContract(underlying, keyOwner, keyWrapperAddress));
    },
    staleTime: 30_000,
    enabled: Boolean(ownerKey && wrapperAddressKey) && queryEnabled,
  };
}
