import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";
import { filterQueryOptions } from "./utils";

export interface IsAllowedQueryConfig {
  /** Contract addresses to check credentials against. */
  contractAddresses: [Address, ...Address[]];
  /**
   * Standard TanStack query options. `isAllowed` intentionally overrides cache
   * timing because permit state is wallet-local, not server state: every fetch
   * should read the SDK credential service directly.
   */
  query?: Record<string, unknown>;
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config: IsAllowedQueryConfig,
  signerContext: SignerQueryContext = {},
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isAllowed.scope>> {
  const callerEnabled = config.query?.enabled !== false;
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: zamaQueryKeys.isAllowed.scope(config.contractAddresses, signerContext.walletAccount),
    queryFn: (context) => {
      const [, { contractAddresses }] = context.queryKey;
      return sdk.permits.isAllowed(contractAddresses as Address[]);
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    enabled:
      callerEnabled &&
      signerContext.walletAccount !== undefined &&
      config.contractAddresses.length > 0,
  } as const;
}
