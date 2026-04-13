import type { QueryObserverOptions } from "@tanstack/query-core";
import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface IsAllowedQueryConfig {
  account: Address;
  /** Contract addresses to check credentials against. */
  contractAddresses: [Address, ...Address[]];
  query?: QueryObserverOptions<
    boolean,
    Error,
    boolean,
    boolean,
    ReturnType<typeof zamaQueryKeys.isAllowed.scope>
  >;
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config: IsAllowedQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isAllowed.scope>> {
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: zamaQueryKeys.isAllowed.scope(config.account, config.contractAddresses),
    queryFn: () => sdk.credentials.isAllowed(config.contractAddresses),
    staleTime: 30_000,
    enabled: config.query?.enabled ?? true,
  } as const;
}
