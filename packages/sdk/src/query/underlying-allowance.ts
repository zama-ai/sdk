import { allowanceContract, underlyingContract } from "../contracts";
import type { ZamaSDK } from "../zama-sdk";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

export interface UnderlyingAllowanceQueryConfig {
  owner?: Address;
  query?: Record<string, unknown>;
}

export function underlyingAllowanceQueryOptions(
  sdk: ZamaSDK,
  tokenAddress: Address,
  config: UnderlyingAllowanceQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.underlyingAllowance.scope>
> {
  const ownerKey = config.owner;
  const queryEnabled = config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.underlyingAllowance.scope(tokenAddress, ownerKey);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, owner: keyOwner }] = context.queryKey;
      assertNonNullable(keyOwner, "underlyingAllowanceQueryOptions: owner");
      const underlying = await sdk.provider.readContract(underlyingContract(keyTokenAddress));
      return sdk.provider.readContract(allowanceContract(underlying, keyOwner, keyTokenAddress));
    },
    staleTime: 30_000,
    enabled: Boolean(ownerKey) && queryEnabled,
  };
}
