import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { DecryptHandle, ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export type { DecryptHandle };

/** Configuration for {@link userDecryptQueryOptions}. */
export interface UserDecryptQueryConfig {
  handles: DecryptHandle[];
  requesterAddress: Address;
  query?: Record<string, unknown>;
}

/**
 * Query options factory for batch-decrypting FHE handles.
 *
 * This factory is requester-scoped and disables retries because decrypt may
 * trigger wallet authorization.
 */
export function userDecryptQueryOptions(
  sdk: ZamaSDK,
  config: UserDecryptQueryConfig,
): QueryFactoryOptions<
  Record<Handle, ClearValueType>,
  Error,
  Record<Handle, ClearValueType>,
  ReturnType<typeof zamaQueryKeys.decryption.batch>
> {
  const { handles, requesterAddress } = config;
  const queryEnabled = config.query?.enabled === true;
  const queryKey = zamaQueryKeys.decryption.batch(handles, requesterAddress);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { handles: keyHandles, account }] = context.queryKey;
      return sdk.userDecrypt(keyHandles, account);
    },
    enabled: handles.length > 0 && queryEnabled,
    staleTime: Infinity,
    retry: false,
  };
}
