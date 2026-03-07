import type { ReadonlyToken } from "../token/readonly-token";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { Address } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export type EncryptedBalanceHandle = Handle;

export interface ConfidentialBalanceQueryConfig {
  owner?: Address;
  handle?: EncryptedBalanceHandle;
  query?: Record<string, unknown>;
}

export function confidentialBalanceQueryOptions(
  token: ReadonlyToken,
  config?: ConfidentialBalanceQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>
> {
  const ownerKey = config?.owner ?? "";
  const handleKey = config?.handle;
  const queryKey = zamaQueryKeys.confidentialBalance.owner(token.address, ownerKey, handleKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { owner: keyOwner, handle: keyHandle }] = context.queryKey;
      return token.decryptBalance(keyHandle as Handle, keyOwner as Address);
    },
    enabled: Boolean(ownerKey && handleKey) && config?.query?.enabled !== false,
    staleTime: Infinity,
  };
}
