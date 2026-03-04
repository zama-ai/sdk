import type { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface ConfidentialBalanceQueryConfig {
  owner?: Address;
  handle?: Address;
  query?: Record<string, unknown>;
}

export function confidentialBalanceQueryOptions(
  token: ReadonlyToken,
  config?: ConfidentialBalanceQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>, bigint> {
  const ownerKey = config?.owner ?? "";
  const handleKey = config?.handle ?? "";
  const queryKey = zamaQueryKeys.confidentialBalance.owner(token.address, ownerKey, handleKey);

  return {
    queryKey,
    queryFn: async (context) => {
      const [, { owner: keyOwner, handle: keyHandle }] = context.queryKey;
      return token.decryptBalance((keyHandle ?? "") as Address, keyOwner as Address);
    },
    enabled: Boolean(ownerKey && handleKey) && config?.query?.enabled !== false,
    staleTime: Infinity,
    ...filterQueryOptions(config?.query ?? {}),
  };
}
