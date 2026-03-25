"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import type {
  DecryptHandle,
  DecryptResult,
  UserDecryptMutationParams,
  UserDecryptOptions,
} from "@zama-fhe/sdk/query";
import { userDecryptMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQueries } from "../utils/query";

/** Configuration for {@link useUserDecrypt}. */
export interface UseUserDecryptConfig extends UserDecryptOptions {
  /** Encrypted handles to track and decrypt. */
  handles?: DecryptHandle[];
}

/**
 * React hook for FHE user decryption. Follows react-query `useMutation` semantics.
 *
 * Handles the full decryption flow: credential acquisition (keypair + EIP-712
 * signing, cached across calls) and relayer decryption — triggered by calling
 * `mutate()`.
 *
 * ### Return value
 *
 * | Field | Type | Description |
 * |-------|------|-------------|
 * | `mutate(params?)` | `function` | Trigger decryption. Without args, decrypts all `config.handles`. Already-cached handles are skipped inside the mutation. |
 * | `mutateAsync(params?)` | `function` | Same as `mutate` but returns `Promise<DecryptResult>`. |
 * | `data` | `DecryptResult \| undefined` | Result of the last successful `mutate` call. |
 * | `values` | `Record<Handle, ClearValueType \| undefined>` | Reactive cache of all tracked handles (populated across calls). |
 * | `isPending` | `boolean` | `true` while decryption is in progress. |
 * | `isSuccess` | `boolean` | `true` after a successful decryption. |
 * | `isError` | `boolean` | `true` if the last decryption failed. |
 * | `error` | `Error \| null` | The error, if any. |
 * | `reset` | `function` | Reset mutation state back to idle. |
 *
 * All other fields from react-query's `useMutation` are also available
 * (e.g., `status`, `variables`, `isIdle`, `failureCount`).
 *
 * @param config - Handles to track and optional lifecycle callbacks (`onCredentialsReady`, `onDecrypted`).
 *
 * @example
 * ```tsx
 * const { mutate, isPending, data } = useUserDecrypt();
 *
 * <button
 *   onClick={() => mutate({
 *     handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
 *   })}
 *   disabled={isPending}
 * >
 *   Decrypt
 * </button>
 * ```
 *
 * @example
 * ```tsx
 * const { values, mutate, isPending } = useUserDecrypt({
 *   handles: [
 *     { handle: "0xA", contractAddress: "0xContract" },
 *     { handle: "0xB", contractAddress: "0xContract" },
 *   ],
 *   onDecrypted: (result) => console.log("Decrypted:", result),
 * });
 *
 * // values["0xA"] is the cached cleartext (or undefined if not yet decrypted)
 * <button onClick={() => mutate()} disabled={isPending}>Decrypt all</button>
 * ```
 */
export function useUserDecrypt(config?: UseUserDecryptConfig) {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();
  const { handles = [], onCredentialsReady, onDecrypted } = config ?? {};

  // Reactive subscription to cached decrypted values for all tracked handles.
  const cacheResults = useQueries({
    queries: handles.map((h) => ({
      queryKey: zamaQueryKeys.decryption.handle(h.handle),
      queryFn: () => {
        throw new Error(
          `[useUserDecrypt] Cache-only query for handle ${h.handle} was unexpectedly executed`,
        );
      },
      enabled: false,
    })),
  });

  const values: Record<Handle, ClearValueType | undefined> = {};
  for (let i = 0; i < handles.length; i++) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    values[handles[i]!.handle] = cacheResults[i]?.data as ClearValueType | undefined;
  }

  const isHandleCached = (handle: Handle): boolean => {
    const state = queryClient.getQueryState(zamaQueryKeys.decryption.handle(handle));
    return state?.dataUpdatedAt !== undefined && state.dataUpdatedAt !== 0;
  };

  const mutation = useMutation<DecryptResult, Error, UserDecryptMutationParams>(
    userDecryptMutationOptions(sdk, {
      onCredentialsReady,
      onDecrypted,
      isHandleCached,
    }),
  );

  return {
    ...mutation,
    mutate: (params?: UserDecryptMutationParams, options?: MutateCallbackOptions) => {
      mutation.mutate(params ?? { handles }, options);
    },
    mutateAsync: (params?: UserDecryptMutationParams, options?: MutateCallbackOptions) => {
      return mutation.mutateAsync(params ?? { handles }, options);
    },
    /** Reactive map of handle → decrypted cleartext (undefined if not yet decrypted). */
    values,
  };
}

/** Return type of {@link useUserDecrypt}. */
export type UseUserDecryptResult = ReturnType<typeof useUserDecrypt>;

/** Callback options forwarded to the underlying `useMutation.mutate()`. */
type MutateCallbackOptions = Parameters<
  ReturnType<typeof useMutation<DecryptResult, Error, UserDecryptMutationParams>>["mutate"]
>[1];
