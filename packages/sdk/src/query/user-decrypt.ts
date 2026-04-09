import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

/** A handle to decrypt, paired with its originating contract address. */
export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/** A map of handles to their decrypted clear-text values. */
export type DecryptResult = Record<Handle, ClearValueType>;

export interface UserDecryptQueryConfig {
  /** The handles to decrypt. */
  handles: DecryptHandle[];
}

/** Query factory for user decryption of FHE handles. */
export function userDecryptQueryOptions(
  sdk: ZamaSDK,
  config: UserDecryptQueryConfig,
  options?: { enabled?: boolean },
): QueryFactoryOptions<
  DecryptResult,
  Error,
  DecryptResult,
  ReturnType<typeof zamaQueryKeys.decryption.handles>
> {
  return {
    queryKey: zamaQueryKeys.decryption.handles(config.handles),
    queryFn: () => sdk.userDecrypt(config.handles),
    staleTime: Infinity,
    enabled: config.handles.length > 0 && options?.enabled !== false,
  };
}
