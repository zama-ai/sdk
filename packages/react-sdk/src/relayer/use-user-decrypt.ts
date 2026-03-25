"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import type {
  DecryptHandle,
  DecryptResult,
  UserDecryptCallbacks,
  UserDecryptMutationParams,
} from "@zama-fhe/sdk/query";
import { hashFn, userDecryptMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/** Configuration for {@link useUserDecrypt}. */
export interface UseUserDecryptConfig extends UserDecryptCallbacks {
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
 * | `mutate(params?)` | `function` | Trigger decryption. Without args, decrypts uncached handles from `config.handles`. No-op if all are cached. |
 * | `mutateAsync(params?)` | `function` | Same as `mutate` but returns `Promise<DecryptResult>`. Resolves with cached values if all cached. |
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
 * // Basic usage — decrypt on button click
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
 * // Track handles — auto-decrypt uncached ones, read cached values reactively
 * const { values, mutate, isPending } = useUserDecrypt({
 *   handles: [
 *     { handle: "0xA", contractAddress: "0xContract" },
 *     { handle: "0xB", contractAddress: "0xContract" },
 *   ],
 *   onDecrypted: (result) => console.log("Decrypted:", result),
 * });
 *
 * // values["0xA"] is the cached cleartext (or undefined if not yet decrypted)
 * // mutate() without args decrypts only uncached handles
 * <button onClick={() => mutate()} disabled={isPending}>Decrypt all</button>
 * ```
 */
export function useUserDecrypt(config?: UseUserDecryptConfig) {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();
  const handles = config?.handles ?? [];
  const { handles: _handles, ...callbacks } = config ?? {};

  // Reactively subscribe to cached decrypted values for all tracked handles
  const cacheResults = useQueries({
    queries: handles.map((h) => ({
      queryKey: zamaQueryKeys.decryption.handle(h.handle),
      queryKeyHashFn: hashFn,
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

  const mutation = useMutation<DecryptResult, Error, UserDecryptMutationParams>(
    userDecryptMutationOptions(sdk, callbacks),
  );

  function getDefaultParams(): UserDecryptMutationParams {
    const uncached = handles.filter((h) => {
      const state = queryClient.getQueryState(zamaQueryKeys.decryption.handle(h.handle));
      return state?.dataUpdatedAt === undefined || state.dataUpdatedAt === 0;
    });
    return { handles: uncached };
  }

  function getCachedValues(requestedHandles: DecryptHandle[]): DecryptResult {
    const cached: DecryptResult = {};
    for (const h of requestedHandles) {
      const state = queryClient.getQueryState(zamaQueryKeys.decryption.handle(h.handle));
      if (state?.data !== undefined) {
        cached[h.handle] = state.data as ClearValueType;
      }
    }
    return cached;
  }

  function mutate(params?: UserDecryptMutationParams, options?: MutateCallbackOptions) {
    const resolved = params ?? getDefaultParams();
    if (resolved.handles.length === 0) {
      return;
    }
    mutation.mutate(resolved, options);
  }

  function mutateAsync(
    params?: UserDecryptMutationParams,
    options?: MutateCallbackOptions,
  ): Promise<DecryptResult> {
    const resolved = params ?? getDefaultParams();
    if (resolved.handles.length === 0) {
      return Promise.resolve(getCachedValues(handles));
    }
    return mutation.mutateAsync(resolved, options);
  }

  return {
    ...mutation,
    mutate,
    mutateAsync,
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
