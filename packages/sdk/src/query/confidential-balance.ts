import type { Address } from "viem";
import type { Token } from "../token";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";
import { filterQueryOptions } from "./utils";

export interface ConfidentialBalanceQueryConfig {
  tokenAddress: Address;
  account?: Address;
  query?: Record<string, unknown>;
}

/** Query options for a single confidential token balance. Auto-gated on `account`. */
export function confidentialBalanceQueryOptions(
  token: Token,
  config: ConfidentialBalanceQueryConfig,
  signerContext: SignerQueryContext = {},
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: zamaQueryKeys.confidentialBalance.owner(
      config.tokenAddress,
      config.account,
      signerContext.walletAccount,
    ),
    queryFn: async (context) => {
      const [, { owner: keyOwner }] = context.queryKey;
      assertNonNullable(keyOwner, "confidentialBalanceQueryOptions: owner");
      return token.balanceOf(keyOwner);
    },
    enabled:
      Boolean(config.account) &&
      signerContext.walletAccount !== undefined &&
      queryOpts?.enabled !== false,
  };
}
