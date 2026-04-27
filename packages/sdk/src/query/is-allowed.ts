import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface IsAllowedQueryConfig {
  /** Contract addresses to check credentials against. */
  contractAddresses: [Address, ...Address[]];
  /**
   * Standard TanStack query options. `isAllowed` intentionally overrides cache
   * timing because credential state is wallet-local session state, not server
   * state: every fetch should read the SDK credential manager directly.
   */
  query?: Record<string, unknown>;
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config: IsAllowedQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isAllowed.scope>> {
  const callerEnabled = config.query?.enabled !== false;
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: zamaQueryKeys.isAllowed.scope(config.contractAddresses),
    queryFn: (context) => {
      const [, { contractAddresses }] = context.queryKey;
      return sdk
        .requireCredentials("isAllowed")
        .isAllowed(contractAddresses as [Address, ...Address[]]);
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    enabled: callerEnabled && sdk.credentials !== undefined,
  } as const;
}
