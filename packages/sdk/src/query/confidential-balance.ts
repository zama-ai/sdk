import type { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "../token/token.types";
import type { Hex } from "viem";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions, normalizeHandle } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export type EncryptedBalanceHandle = Hex | string;

export interface ConfidentialBalanceQueryConfig {
  owner?: Address;
  handle?: EncryptedBalanceHandle;
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
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { owner: keyOwner, handle: keyHandle }] = context.queryKey;
      return token.decryptBalance(normalizeHandle(keyHandle), keyOwner as Address);
    },
    enabled: Boolean(ownerKey && handleKey) && config?.query?.enabled !== false,
    staleTime: Infinity,
  };
}
