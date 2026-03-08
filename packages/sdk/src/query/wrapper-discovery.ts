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
): QueryFactoryOptions<
  Address | null,
  Error,
  Address | null,
  ReturnType<typeof zamaQueryKeys.wrapperDiscovery.token>
> {
  const queryKey = zamaQueryKeys.wrapperDiscovery.token(tokenAddress, config.coordinatorAddress);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context: { queryKey: typeof queryKey }) => {
      const [, { tokenAddress: keyTokenAddress, coordinatorAddress: keyCoordinatorAddress }] =
        context.queryKey;
      const exists = await signer.readContract(
        wrapperExistsContract(keyCoordinatorAddress as Address, keyTokenAddress as Address),
      );
      if (!exists) return null;
      return signer.readContract(
        getWrapperContract(keyCoordinatorAddress as Address, keyTokenAddress as Address),
      );
    },
    staleTime: Infinity,
    enabled: Boolean(tokenAddress) && config.query?.enabled !== false,
  };
}
