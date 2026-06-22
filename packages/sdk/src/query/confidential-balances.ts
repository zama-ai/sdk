import type { Address } from "viem";
import { Token, type BatchBalancesResult } from "../token/token";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";
import { filterQueryOptions } from "./utils";

export interface ConfidentialBalancesQueryConfig {
  account?: Address;
  query?: Record<string, unknown>;
}

export function confidentialBalancesQueryOptions(
  tokens: Token[],
  config?: ConfidentialBalancesQueryConfig,
  signerContext: SignerQueryContext = {},
): QueryFactoryOptions<
  BatchBalancesResult,
  Error,
  BatchBalancesResult,
  ReturnType<typeof zamaQueryKeys.confidentialBalances.tokens>
> {
  const accountKey = config?.account;
  const walletAccount = signerContext.walletAccount;
  const queryOpts = config?.query ?? {};
  const tokenAddresses = tokens.map((token) => token.address);

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, accountKey, walletAccount),
    queryFn: async (signerContextQuery) => {
      const [, { owner: keyOwner }] = signerContextQuery.queryKey;
      assertNonNullable(keyOwner, "confidentialBalancesQueryOptions: owner");
      return Token.batchBalancesOf(tokens, keyOwner);
    },
    enabled:
      Boolean(accountKey) &&
      tokens.length > 0 &&
      walletAccount !== undefined &&
      queryOpts?.enabled !== false,
  };
}
