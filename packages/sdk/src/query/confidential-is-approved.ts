import { isOperatorContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface ConfidentialIsApprovedQueryConfig {
  owner?: Address;
  spender: Address;
  query?: Record<string, unknown>;
}

export function confidentialIsApprovedQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config: ConfidentialIsApprovedQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.confidentialIsApproved.scope>, boolean> {
  const ownerKey = config.owner ?? "";
  const queryKey = zamaQueryKeys.confidentialIsApproved.scope(
    tokenAddress,
    ownerKey,
    config.spender,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, owner: keyOwner, spender: keySpender }] =
        context.queryKey;
      const owner = keyOwner ? (keyOwner as Address) : await signer.getAddress();
      return signer.readContract<boolean>(
        isOperatorContract(keyTokenAddress as Address, owner, keySpender as Address),
      );
    },
    staleTime: 30_000,
    enabled: config.query?.enabled !== false,
  };
}
