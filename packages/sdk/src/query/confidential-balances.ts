import type { Address } from "viem";
import { ReadonlyToken, type BatchBalancesResult } from "../token/readonly-token";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface ConfidentialBalancesQueryConfig {
  account?: Address;
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
  const accountKey = config?.account;
  const queryOpts = config?.query ?? {};
  const tokenAddresses = tokens.map((token) => token.address);
  const hasSignerBackedCredentials = tokens.every((token) => token.sdk.credentials !== undefined);

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, accountKey),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      assertNonNullable(keyOwner, "confidentialBalancesQueryOptions: owner");
      return ReadonlyToken.batchBalancesOf(tokens, keyOwner);
    },
    enabled:
      Boolean(accountKey) &&
      tokens.length > 0 &&
      hasSignerBackedCredentials &&
      queryOpts?.enabled !== false,
  };
}
