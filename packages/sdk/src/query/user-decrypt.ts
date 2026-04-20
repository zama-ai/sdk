import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/** Decrypted values keyed by handle. */
export type DecryptResult = Record<Handle, ClearValueType>;

export interface UserDecryptQueryConfig {
  handles: DecryptHandle[];
}

export function userDecryptQueryOptions(
  sdk: ZamaSDK,
  config: UserDecryptQueryConfig,
): QueryFactoryOptions<
  DecryptResult,
  Error,
  DecryptResult,
  ReturnType<typeof zamaQueryKeys.decryption.handles>
> {
  return {
    queryKey: zamaQueryKeys.decryption.handles(config.handles),
    queryFn: (context) => {
      const [, { handles }] = context.queryKey;
      return sdk.userDecrypt(handles as DecryptHandle[]);
    },
    staleTime: Infinity,
    enabled: config.handles.length > 0,
  };
}
