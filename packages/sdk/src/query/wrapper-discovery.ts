import type { Address } from "viem";
import { WrappersRegistry } from "../token/wrappers-registry";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface WrapperDiscoveryQueryConfig {
  /**
   * The ERC-20 token address to discover the confidential wrapper for.
   * The registry is resolved automatically from chain config.
   */
  erc20Address?: Address;
  /**
   * Optional per-chain registry address overrides.
   * Useful for local development chains (e.g. Hardhat) where no default registry exists.
   */
  registryAddresses?: Record<number, Address>;
  /**
   * Optional pre-existing registry instance. When provided, its cache is reused
   * across calls instead of creating a fresh instance per query execution.
   */
  registry?: WrappersRegistry;
  query?: Record<string, unknown>;
}

export function wrapperDiscoveryQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address | undefined,
  config: WrapperDiscoveryQueryConfig,
): QueryFactoryOptions<
  Address | null,
  Error,
  Address | null,
  ReturnType<typeof zamaQueryKeys.wrapperDiscovery.token>
> {
  const queryKey = zamaQueryKeys.wrapperDiscovery.token(tokenAddress, config.erc20Address);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async () => {
      if (!config.erc20Address) {
        return null;
      }
      const registry =
        config.registry ??
        new WrappersRegistry({
          signer,
          registryAddresses: config.registryAddresses,
        });
      const result = await registry.getConfidentialToken(config.erc20Address);
      return result ? result.confidentialTokenAddress : null;
    },
    staleTime: Infinity,
    enabled: Boolean(tokenAddress && config.erc20Address) && config.query?.enabled !== false,
  };
}
