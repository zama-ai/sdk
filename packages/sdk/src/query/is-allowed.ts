import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface IsAllowedQueryConfig {
  account: Address;
  /** Contract addresses to check credentials against. */
  contractAddresses: Address[];
  query?: { enabled?: boolean };
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config: IsAllowedQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isAllowed.scope>> {
  const filteredQuery = filterQueryOptions(config.query ?? {});
  return {
    ...filteredQuery,
    queryKey: zamaQueryKeys.isAllowed.scope(config.account, config.contractAddresses),
    queryFn: () => sdk.credentials.isAllowed(config.contractAddresses),
    staleTime: 30_000,
    enabled: config.query?.enabled ?? true,
  } as const;
}
