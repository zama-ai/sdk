import type { ZamaSDK } from "../token/zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export const isAllowedQueryKeys = zamaQueryKeys.isAllowed;

export interface IsAllowedQueryConfig {
  query?: Record<string, unknown>;
}

export function isAllowedQueryOptions(
  sdk: ZamaSDK,
  config?: IsAllowedQueryConfig,
): QueryFactoryOptions<typeof zamaQueryKeys.isAllowed.all, boolean> {
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: isAllowedQueryKeys.all,
    queryFn: () => sdk.isAllowed(),
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  } as const;
}
