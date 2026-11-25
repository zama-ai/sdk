"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { DecryptInput, DecryptResult } from "@zama-fhe/sdk/query";
import { decryptValuesQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

/**
 * React hook for FHE user decryption. Thin wrapper around
 * `decryptValuesQueryOptions` with `useQuery` semantics.
 */
export function useDecryptValues(
  encryptedInputs: DecryptInput[],
  options?: Omit<UseQueryOptions<DecryptResult>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();
  const walletAccount = useWalletAccount(sdk);
  const queryOpts = decryptValuesQueryOptions(sdk, encryptedInputs, { walletAccount });
  return useQuery<DecryptResult>({
    ...queryOpts,
    ...options,
    enabled: queryOpts.enabled && (options?.enabled ?? false),
  });
}

/** Return type of {@link useDecryptValues}. */
export type UseDecryptValuesResult = ReturnType<typeof useDecryptValues>;
