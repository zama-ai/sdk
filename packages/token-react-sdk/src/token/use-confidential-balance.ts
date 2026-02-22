"use client";

import { useEffect, useState } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";
import { confidentialBalanceQueryKeys, confidentialHandleQueryKeys } from "./balance-query-keys";

export interface UseConfidentialBalanceConfig {
  tokenAddress: Address;
  handleRefetchInterval?: number;
}

export type UseConfidentialBalanceOptions = Omit<
  UseQueryOptions<bigint, Error>,
  "queryKey" | "queryFn"
>;

const DEFAULT_HANDLE_REFETCH_INTERVAL = 10_000;

/**
 * Declarative hook to read the connected wallet's confidential token balance.
 * Uses two-phase polling: cheaply polls the encrypted handle, then only
 * decrypts when the handle changes (new balance).
 */
export function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
) {
  const { tokenAddress, handleRefetchInterval } = config;
  const token = useReadonlyToken(tokenAddress);
  // Resolve the signer address for stable query keys.
  // This prevents cache collisions when wallet switches.
  const [signerAddress, setSignerAddress] = useState<Address | undefined>();

  useEffect(() => {
    token.signer.getAddress().then(setSignerAddress);
  }, [token.signer]);

  const ownerKey = signerAddress ?? "";

  // Phase 1: Poll the encrypted handle (cheap RPC read, no signing)
  const handleQuery = useQuery<Address, Error>({
    queryKey: confidentialHandleQueryKeys.owner(tokenAddress, ownerKey),
    queryFn: () => token.confidentialBalanceOf(),
    enabled: !!signerAddress,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handle = handleQuery.data;

  // Phase 2: Decrypt only when handle changes (expensive relayer roundtrip)
  const balanceQuery = useQuery<bigint, Error>({
    queryKey: [...confidentialBalanceQueryKeys.owner(tokenAddress, ownerKey), handle ?? ""],
    queryFn: () => token.decryptBalance(handle!),
    enabled: !!signerAddress && !!handle,
    staleTime: Infinity,
    ...options,
  });

  return { ...balanceQuery, handleQuery };
}
