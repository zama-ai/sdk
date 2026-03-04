import type { ZamaSDK } from "../token/zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export interface PublicKeyQueryConfig {
  query?: Record<string, unknown>;
}

export function publicKeyQueryOptions(
  sdk: ZamaSDK,
  config?: PublicKeyQueryConfig,
): QueryFactoryOptions<
  typeof zamaQueryKeys.publicKey.all,
  { publicKeyId: string; publicKey: Uint8Array } | null
> {
  const queryKey = zamaQueryKeys.publicKey.all;

  return {
    queryKey,
    queryFn: async () => sdk.relayer.getPublicKey(),
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
    ...filterQueryOptions(config?.query ?? {}),
  };
}
