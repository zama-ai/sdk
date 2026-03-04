import { getWrapperContract, wrapperExistsContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface WrapperDiscoveryQueryConfig {
  coordinatorAddress: Address;
  query?: Record<string, unknown>;
}

export function wrapperDiscoveryQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config: WrapperDiscoveryQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.wrapperDiscovery.token>, Address | null> {
  const queryKey = zamaQueryKeys.wrapperDiscovery.token(tokenAddress);

  return {
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
      const exists = await signer.readContract<boolean>(
        wrapperExistsContract(config.coordinatorAddress, keyTokenAddress as Address),
      );
      if (!exists) return null;
      return signer.readContract<Address>(
        getWrapperContract(config.coordinatorAddress, keyTokenAddress as Address),
      );
    },
    staleTime: Infinity,
    enabled: config.query?.enabled !== false,
    ...filterQueryOptions(config.query ?? {}),
  };
}
