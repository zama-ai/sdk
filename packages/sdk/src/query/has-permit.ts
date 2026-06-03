import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";
import { filterQueryOptions } from "./utils";

export interface HasPermitQueryConfig {
  /**
   * Contract addresses to check credentials against. An empty list disables the
   * query (it is a no-op rather than a type or runtime error).
   */
  contractAddresses: Address[];
  /**
   * Standard TanStack query options. `hasPermit` intentionally overrides cache
   * timing because permit state is wallet-local, not server state: every fetch
   * should read the SDK credential service directly.
   */
  query?: Record<string, unknown>;
}

export function hasPermitQueryOptions(
  sdk: ZamaSDK,
  config: HasPermitQueryConfig,
  signerContext: SignerQueryContext = {},
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.hasPermit.scope>> {
  const callerEnabled = config.query?.enabled !== false;
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: zamaQueryKeys.hasPermit.scope(config.contractAddresses, signerContext.walletAccount),
    queryFn: (context) => {
      const [, { contractAddresses }] = context.queryKey;
      return sdk.permits.hasPermit(contractAddresses as Address[]);
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
