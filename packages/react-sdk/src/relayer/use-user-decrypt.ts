"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  DecryptResult,
  UserDecryptMutationParams,
  UserDecryptOptions,
} from "@zama-fhe/sdk/query";
import { userDecryptMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/** Configuration for {@link useUserDecrypt}. */
export type UseUserDecryptConfig = UserDecryptOptions;

/**
 * React hook for FHE user decryption. Follows react-query `useMutation` semantics.
 *
 * Handles the full decryption flow: credential acquisition (keypair + EIP-712
 * signing, cached across calls) and relayer decryption — triggered by calling
 * `mutate()`.
 *
 * Returns a standard `useMutation` result. Call `mutate()` without args to
 * decrypt all `config.handles` (cached handles are skipped automatically),
 * or pass explicit `{ handles }` to override.
 *
 * @param config - Default handles and optional lifecycle callbacks (`onCredentialsReady`, `onDecrypted`).
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
 * const { mutate, data, isPending } = useUserDecrypt({
 *   handles: [
 *     { handle: "0xA", contractAddress: "0xContract" },
 *     { handle: "0xB", contractAddress: "0xContract" },
 *   ],
 *   onDecrypted: (result) => console.log("Decrypted:", result),
 * });
 *
 * // mutate() without args decrypts all config.handles (skips cached)
 * <button onClick={() => mutate()} disabled={isPending}>Decrypt all</button>
 * ```
 */
export function useUserDecrypt(config?: UseUserDecryptConfig) {
  const sdk = useZamaSDK();
  return useMutation<DecryptResult, Error, UserDecryptMutationParams | void>(
    userDecryptMutationOptions(sdk, config),
  );
}

/** Return type of {@link useUserDecrypt}. */
export type UseUserDecryptResult = ReturnType<typeof useUserDecrypt>;
