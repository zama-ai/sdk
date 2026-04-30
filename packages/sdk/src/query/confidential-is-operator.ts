import { isOperatorContract } from "../contracts";
import type { ZamaSDK } from "../zama-sdk";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

export interface ConfidentialIsOperatorQueryConfig {
  holder?: Address;
  spender?: Address;
  query?: Record<string, unknown>;
}

export function confidentialIsOperatorQueryOptions(
  sdk: ZamaSDK,
  tokenAddress: Address | undefined,
  config: ConfidentialIsOperatorQueryConfig,
): QueryFactoryOptions<
  boolean,
  Error,
  boolean,
  ReturnType<typeof zamaQueryKeys.confidentialIsOperator.scope>
> {
  const holderKey = config.holder;
  const spenderKey = config.spender;
  const queryEnabled = config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialIsOperator.scope(tokenAddress, holderKey, spenderKey);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, holder: keyHolder, spender: keySpender }] =
        context.queryKey;
      assertNonNullable(keyTokenAddress, "confidentialIsOperatorQueryOptions: tokenAddress");
      assertNonNullable(keyHolder, "confidentialIsOperatorQueryOptions: holder");
      assertNonNullable(keySpender, "confidentialIsOperatorQueryOptions: spender");
      return sdk.provider.readContract(isOperatorContract(keyTokenAddress, keyHolder, keySpender));
    },
    staleTime: 30_000,
    enabled: Boolean(tokenAddress && holderKey && spenderKey) && queryEnabled,
  };
}
