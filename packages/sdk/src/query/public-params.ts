import type { PublicParamsData } from "../relayer/relayer-sdk.types";
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
  PublicParamsData | null,
  Error,
  PublicParamsData | null,
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
