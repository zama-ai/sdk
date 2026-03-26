import type { Address } from "viem";
import type { WrappersRegistry } from "../wrappers-registry";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface WrapperDiscoveryQueryConfig {
  /**
   * Address of any confidential token you control.
   * Used only to scope the query cache key — it does not affect
   * which wrapper the registry returns.
   */
  tokenAddress?: Address;
  /**
   * The ERC-20 token address to discover the confidential wrapper for.
   * The registry is resolved automatically from chain config.
   */
  erc20Address?: Address;
  /**
   * The resolved registry contract address for the current chain.
   * Included in the query key so that switching chains invalidates
   * stale cached results. Pass `undefined` when the chain ID is not
   * yet known — the query will be disabled.
   */
  registryAddress?: Address;
  query?: Record<string, unknown>;
}

export function wrapperDiscoveryQueryOptions(
  registry: WrappersRegistry,
  config: WrapperDiscoveryQueryConfig,
): QueryFactoryOptions<
  Address | null,
  Error,
  Address | null,
  ReturnType<typeof zamaQueryKeys.wrapperDiscovery.token>
> {
  const queryKey = zamaQueryKeys.wrapperDiscovery.token(
    config.tokenAddress,
    config.erc20Address,
    config.registryAddress,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async () => {
      if (!config.erc20Address) {
        return null;
      }
      const result = await registry.getConfidentialToken(config.erc20Address);
      return result ? result.confidentialTokenAddress : null;
    },
    staleTime: Infinity,
    enabled: Boolean(config.tokenAddress && config.erc20Address) && config.query?.enabled !== false,
  };
}
