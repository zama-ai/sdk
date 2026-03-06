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
  { publicKeyId: string; publicKey: Uint8Array } | null,
  Error,
  { publicKeyId: string; publicKey: Uint8Array } | null,
  typeof zamaQueryKeys.publicKey.all
> {
  const queryKey = zamaQueryKeys.publicKey.all;

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async () => sdk.relayer.getPublicKey(),
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
