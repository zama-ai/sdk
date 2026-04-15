import type { Address } from "viem";
import { ReadonlyToken, type BatchBalancesResult } from "../token/readonly-token";
import type { EncryptedBalanceHandle } from "./confidential-balance";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface ConfidentialBalancesQueryConfig {
  owner?: Address;
  handles?: EncryptedBalanceHandle[];
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
  const { owner, handles, query = {} } = config ?? {};
  const tokenAddresses = tokens.map((token) => token.address);

  return {
    ...filterQueryOptions(query),
    queryKey: zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, owner, handles),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      return ReadonlyToken.batchBalancesOf(tokens, keyOwner);
    },
    enabled: tokens.length > 0 && query?.enabled !== false,
    staleTime: Infinity,
  };
}
