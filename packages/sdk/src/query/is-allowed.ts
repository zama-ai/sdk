import type { ZamaSDK } from "../token/zama-sdk";
import type { Address } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

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
    staleTime: Infinity,
    enabled: config.query?.enabled !== false,
  } as const;
}
