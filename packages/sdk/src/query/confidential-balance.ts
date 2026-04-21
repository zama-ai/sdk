import type { Address } from "viem";
import type { ReadonlyToken } from "../token";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface ConfidentialBalanceQueryConfig {
  tokenAddress: Address;
  owner?: Address;
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
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: zamaQueryKeys.confidentialBalance.owner(config.tokenAddress, config.owner),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      return token.balanceOf(keyOwner);
    },
    enabled: queryOpts?.enabled !== false,
  };
}
