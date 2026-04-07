import type { ZamaSDK } from "../zama-sdk";

import type { Address } from "viem";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface IsAllowedQueryConfig {
  account: Address;
  query?: { enabled?: boolean };
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config: IsAllowedQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isAllowed.scope>> {
  const { account, query = {} } = config;
  return {
    ...filterQueryOptions(query),
    queryKey: zamaQueryKeys.isAllowed.scope(account),
    queryFn: () => sdk.credentials.isAllowed(),
    staleTime: 30_000,
    enabled: query?.enabled,
  } as const;
}
