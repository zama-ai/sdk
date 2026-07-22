import type { Address } from "viem";
import { Token, type BatchBalancesResult } from "../token/token";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";
import { filterQueryOptions } from "./utils";

/** Configuration for {@link confidentialBalancesQueryOptions}. */
export interface ConfidentialBalancesQueryConfig {
  /** Account whose confidential balances to read; the query stays disabled until provided. */
  account?: Address;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Builds TanStack Query options for reading the confidential balances of several tokens for one account in a single batch. */
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
