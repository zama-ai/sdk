import type { Address } from "../utils/address";
import { isOperatorContract } from "../contracts";
import type { GenericSigner } from "../types";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface ConfidentialIsApprovedQueryConfig {
  holder?: Address;
  spender?: Address;
  query?: Record<string, unknown>;
}

export function confidentialIsApprovedQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address | undefined,
  config: ConfidentialIsApprovedQueryConfig,
): QueryFactoryOptions<
  boolean,
  Error,
  boolean,
  ReturnType<typeof zamaQueryKeys.confidentialIsApproved.scope>
> {
  const holderKey = config.holder;
  const spenderKey = config.spender;
  const queryEnabled = config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialIsApproved.scope(tokenAddress, holderKey, spenderKey);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, holder: keyHolder, spender: keySpender }] =
        context.queryKey;
      assertNonNullable(keyTokenAddress, "confidentialIsApprovedQueryOptions: tokenAddress");
      assertNonNullable(keyHolder, "confidentialIsApprovedQueryOptions: holder");
      assertNonNullable(keySpender, "confidentialIsApprovedQueryOptions: spender");
      return signer.readContract(isOperatorContract(keyTokenAddress, keyHolder, keySpender));
    },
    staleTime: 30_000,
    enabled: Boolean(tokenAddress && holderKey && spenderKey) && queryEnabled,
  };
}
