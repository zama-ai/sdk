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

/**
 * Query options for a single confidential token balance.
 *
 * **Owner gating:** this factory does not gate on `owner !== undefined` because
 * it is also used outside React with an explicit owner. React consumers should
 * apply the gate at the hook level (e.g. `enabled: ... && owner !== undefined`),
 * as {@link useConfidentialBalance} does.
 */
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
