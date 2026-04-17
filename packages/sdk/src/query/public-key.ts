import type { PublicKeyData } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
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
  PublicKeyData | null,
  Error,
  PublicKeyData | null,
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
