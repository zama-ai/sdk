import type { Address } from "viem";
import { getWrapperContract, wrapperExistsContract } from "../contracts";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

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
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, coordinatorAddress: keyCoordinatorAddress }] =
        context.queryKey;
      const exists = await signer.readContract(
        wrapperExistsContract(keyCoordinatorAddress, keyTokenAddress),
      );
      if (!exists) {
        return null;
      }
      return signer.readContract(getWrapperContract(keyCoordinatorAddress, keyTokenAddress));
    },
    staleTime: Infinity,
    enabled: Boolean(tokenAddress) && config.query?.enabled !== false,
  };
}
