"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  delegateDecryptionMutationOptions,
  type DelegateDecryptionParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Delegate FHE decryption rights for a token to another address via the on-chain ACL.
 *
 * @param config - Token address identifying the confidential token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const delegate = useDelegateDecryption({ tokenAddress: "0x..." });
 * delegate.mutate({ delegate: "0xDelegate" });
 * ```
 */
export function useDelegateDecryption(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, DelegateDecryptionParams>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, DelegateDecryptionParams>({
    ...delegateDecryptionMutationOptions(token),
    ...options,
  });
}
