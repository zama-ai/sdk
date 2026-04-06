import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

/** A handle to decrypt, paired with its originating contract address. */
export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/**
 * A map of handles to their decrypted clear-text values.
 *
 * Keyed by {@link Handle} alone (no contract dimension). This is safe because
 * FHE handles are globally unique across contracts — two different contracts
 * never produce the same handle value.
 */
export type DecryptResult = Record<Handle, ClearValueType>;

/** Variables for {@link userDecryptMutationOptions}. */
export interface UserDecryptMutationParams {
  handles: DecryptHandle[];
}

export interface UserDecryptOptions {
  /** Default handles used when `mutate()` is called without arguments. */
  handles?: DecryptHandle[];
  /** Fired after credentials are ready (cached or freshly signed), before relayer calls. Not called when all handles are already cached. */
  onCredentialsReady?: () => void;
  /** Fired after all handles have been decrypted, including when all results come from cache. Not called when the handles array is empty. */
  onDecrypted?: (values: DecryptResult) => void;
}

export function userDecryptMutationOptions(
  sdk: ZamaSDK,
  options?: UserDecryptOptions,
): MutationFactoryOptions<
  readonly ["zama.userDecrypt"],
  UserDecryptMutationParams | void,
  DecryptResult
> {
  return {
    mutationKey: ["zama.userDecrypt"] as const,
    mutationFn: async (params) => {
      const handles = params?.handles ?? options?.handles ?? [];

      if (handles.length === 0) {
        return {};
      }

      return sdk.decrypt(handles, options);
    },
    onSuccess: (data, variables, _onMutateResult, context) => {
      const inputHandles = variables?.handles ?? options?.handles ?? [];
      for (const h of inputHandles) {
        const value = data[h.handle];
        if (value !== undefined) {
          context.client.setQueryData(
            zamaQueryKeys.decryption.handle(h.handle, h.contractAddress),
            value,
          );
        }
      }
    },
  };
}
