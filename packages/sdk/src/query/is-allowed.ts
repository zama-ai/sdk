import type { ZamaSDK } from "../token/zama-sdk";

import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

export interface IsAllowedQueryConfig {
  account: Address;
  query?: Record<string, unknown>;
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config: IsAllowedQueryConfig,
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof zamaQueryKeys.isAllowed.scope>> {
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: zamaQueryKeys.isAllowed.scope(config.account),
    queryFn: () => sdk.isAllowed(),
    staleTime: 30_000,
    enabled: config.query?.enabled !== false,
  } as const;
}
