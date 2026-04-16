import type { Address } from "viem";
import type { ReadonlyToken } from "../token";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

const DEFAULT_POLLING_INTERVAL = 10_000;

export interface ConfidentialBalanceQueryConfig {
  tokenAddress: Address;
  owner?: Address;
  pollingInterval?: number;
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
  const { tokenAddress, owner, pollingInterval, query = {} } = config;

  return {
    ...filterQueryOptions(query),
    queryKey: zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      return token.balanceOf(keyOwner);
    },
    enabled: query?.enabled !== false,
    refetchInterval: pollingInterval ?? DEFAULT_POLLING_INTERVAL,
  };
}
