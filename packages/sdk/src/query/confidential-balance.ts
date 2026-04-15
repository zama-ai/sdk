import type { Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { ReadonlyToken } from "../token";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export type EncryptedBalanceHandle = Handle;

export interface ConfidentialBalanceQueryConfig {
  tokenAddress: Address;
  owner?: Address;
  handle?: EncryptedBalanceHandle;
  query?: Record<string, unknown>;
}

export function confidentialBalanceQueryOptions(
  token: ReadonlyToken,
  config: ConfidentialBalanceQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>
> {
  const { tokenAddress, owner, handle, query = {} } = config;

  return {
    ...filterQueryOptions(query),
    queryKey: zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner, handle),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      return token.balanceOf(keyOwner);
    },
    enabled: query?.enabled !== false,
    staleTime: Infinity,
  };
}
