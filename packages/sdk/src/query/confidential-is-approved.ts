import { isOperatorContract } from "../contracts";
import type { GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

export interface ConfidentialIsApprovedQueryConfig {
  holder?: Address;
  spender?: Address;
  query?: Record<string, unknown>;
}

export function confidentialIsApprovedQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
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
      if (!keyHolder) {
        throw new Error("holder is required");
      }
      if (!keySpender) {
        throw new Error("spender is required");
      }
      return signer.readContract(isOperatorContract(keyTokenAddress, keyHolder, keySpender));
    },
    staleTime: 30_000,
    enabled: Boolean(holderKey && spenderKey) && queryEnabled,
  };
}
