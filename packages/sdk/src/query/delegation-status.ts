import type { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface DelegationStatusData {
  isDelegated: boolean;
  expiryTimestamp: bigint;
}

export interface DelegationStatusQueryConfig {
  delegator: Address;
  delegate: Address;
  query?: Record<string, unknown>;
}

export function delegationStatusQueryOptions(
  readonlyToken: ReadonlyToken,
  config: DelegationStatusQueryConfig,
): QueryFactoryOptions<
  DelegationStatusData,
  Error,
  DelegationStatusData,
  ReturnType<typeof zamaQueryKeys.delegationStatus.scope>
> {
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: zamaQueryKeys.delegationStatus.scope(
      readonlyToken.address,
      config.delegator,
      config.delegate,
    ),
    queryFn: async () => {
      const expiryTimestamp = await readonlyToken.getDelegationExpiry(
        config.delegator,
        config.delegate,
      );
      const isDelegated = await readonlyToken.isDelegated(config.delegator, config.delegate);
      return { isDelegated, expiryTimestamp };
    },
    enabled: config.query?.enabled !== false,
  } as const;
}
