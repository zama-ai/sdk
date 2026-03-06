import { isOperatorContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface ConfidentialIsApprovedQueryConfig {
  holder: Address;
  spender: Address;
  query?: Record<string, unknown>;
}

export function confidentialIsApprovedQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config: ConfidentialIsApprovedQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.confidentialIsApproved.scope>, boolean> {
  const queryKey = zamaQueryKeys.confidentialIsApproved.scope(
    tokenAddress,
    config.holder,
    config.spender,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, holder: keyHolder, spender: keySpender }] =
        context.queryKey;
      return signer.readContract(
        isOperatorContract(keyTokenAddress as Address, keyHolder as Address, keySpender as Address),
      );
    },
    staleTime: 30_000,
    enabled: config.query?.enabled !== false,
  };
}
