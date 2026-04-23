import type { Address } from "../utils/address";
import { ReadonlyToken, type BatchBalancesResult } from "../token/readonly-token";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface ConfidentialBalancesQueryConfig {
  owner?: Address;
  query?: Record<string, unknown>;
}

export function confidentialBalancesQueryOptions(
  tokens: ReadonlyToken[],
  config?: ConfidentialBalancesQueryConfig,
): QueryFactoryOptions<
  BatchBalancesResult,
  Error,
  BatchBalancesResult,
  ReturnType<typeof zamaQueryKeys.confidentialBalances.tokens>
> {
  const ownerKey = config?.owner;
  const queryOpts = config?.query ?? {};
  const tokenAddresses = tokens.map((token) => token.address);

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, ownerKey),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      return ReadonlyToken.batchBalancesOf(tokens, keyOwner);
    },
    enabled: tokens.length > 0 && queryOpts?.enabled !== false,
  };
}
