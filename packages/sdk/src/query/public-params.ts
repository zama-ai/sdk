import type { ZamaSDK } from "../token/zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface PublicParamsQueryConfig {
  query?: Record<string, unknown>;
}

export function publicParamsQueryOptions(
  sdk: ZamaSDK,
  bits: number,
  config?: PublicParamsQueryConfig,
): QueryFactoryOptions<
  ReturnType<typeof zamaQueryKeys.publicParams.bits>,
  { publicParams: Uint8Array; publicParamsId: string } | null
> {
  const queryKey = zamaQueryKeys.publicParams.bits(bits);

  return {
    queryKey,
    queryFn: async (context) => {
      const [, { bits: keyBits }] = context.queryKey;
      return sdk.relayer.getPublicParams(keyBits);
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
    ...filterQueryOptions(config?.query ?? {}),
  };
}
