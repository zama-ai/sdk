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

/** A map of handles to their decrypted clear-text values. */
export type DecryptResult = Record<Handle, ClearValueType>;

/** Variables for {@link userDecryptMutationOptions}. */
export interface UserDecryptMutationParams {
  handles: DecryptHandle[];
}

export interface UserDecryptOptions {
  /** Default handles used when `mutate()` is called without arguments. */
  handles?: DecryptHandle[];
  /** Fired after credentials are ready (either from cache or freshly generated). */
  onCredentialsReady?: () => void;
  /** Fired after decryption completes. */
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
      const { onCredentialsReady, onDecrypted } = options ?? {};

      if (handles.length === 0) {return {};}

      const result = await sdk.decrypt(handles);

      try { onCredentialsReady?.(); } catch {}
      try { onDecrypted?.(result); } catch {}
      return result;
    },
    onSuccess: (data, _variables, _onMutateResult, context) => {
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        context.client.setQueryData(zamaQueryKeys.decryption.handle(handle), value);
      }
    },
  };
}
