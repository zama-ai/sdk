import type { ZamaSDK } from "../zama-sdk";
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
  { publicParams: Uint8Array; publicParamsId: string } | null,
  Error,
  { publicParams: Uint8Array; publicParamsId: string } | null,
  ReturnType<typeof zamaQueryKeys.publicParams.bits>
> {
  const queryKey = zamaQueryKeys.publicParams.bits(bits);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { bits: keyBits }] = context.queryKey;
      return sdk.relayer.getPublicParams(keyBits);
    },
    staleTime: Infinity,
    enabled: config?.query?.enabled !== false,
  };
}
