import type { Address } from "../utils/address";
import { allowanceContract, underlyingContract } from "../contracts";
import type { GenericSigner } from "../types";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

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
    queryFn: async (context) => {
      const [, { owner: keyOwner, wrapperAddress: keyWrapperAddress }] = context.queryKey;
      assertNonNullable(keyOwner, "underlyingAllowanceQueryOptions: owner");
      assertNonNullable(keyWrapperAddress, "underlyingAllowanceQueryOptions: wrapperAddress");
      const underlying = await signer.readContract(underlyingContract(keyWrapperAddress));
      return signer.readContract(allowanceContract(underlying, keyOwner, keyWrapperAddress));
    },
    staleTime: 30_000,
    enabled: Boolean(ownerKey && wrapperAddressKey) && queryEnabled,
  };
}
