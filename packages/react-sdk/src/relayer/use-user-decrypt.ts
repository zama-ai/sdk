"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { DecryptResult, UserDecryptQueryConfig } from "@zama-fhe/sdk/query";
import { userDecryptQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

/**
 * React hook for FHE user decryption. Thin wrapper around
 * `userDecryptQueryOptions` with `useQuery` semantics.
 */
export function useUserDecrypt(
  config: UserDecryptQueryConfig,
  options?: Omit<UseQueryOptions<DecryptResult>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();
  const walletAccount = useWalletAccount(sdk);
  const queryOpts = userDecryptQueryOptions(sdk, config, { walletAccount });
  return useQuery<DecryptResult>({
    ...queryOpts,
    ...options,
    enabled: queryOpts.enabled && (options?.enabled ?? false),
  });
}

/** Return type of {@link useUserDecrypt}. */
export type UseUserDecryptResult = ReturnType<typeof useUserDecrypt>;
