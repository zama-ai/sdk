"use client";

import { useEffect, useState } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";
import { confidentialBalanceQueryKeys, confidentialHandleQueryKeys } from "./balance-query-keys";

export interface UseConfidentialBalanceOptions extends Omit<
  UseQueryOptions<bigint, Error>,
  "queryKey" | "queryFn"
> {
  handleRefetchInterval?: number;
}

const DEFAULT_HANDLE_REFETCH_INTERVAL = 10_000;

/**
 * Declarative hook to read a confidential token balance.
 * Uses two-phase polling: cheaply polls the encrypted handle, then only
 * decrypts when the handle changes (new balance).
 */
export function useConfidentialBalance(
  tokenAddress: Address,
  owner?: Address,
  options?: UseConfidentialBalanceOptions,
) {
  const { handleRefetchInterval, ...balanceOptions } = options ?? {};
  const token = useReadonlyToken(tokenAddress);
  // Resolve the actual owner address to use in query keys.
  // This prevents cache collisions when wallet switches.
  const [resolvedOwner, setResolvedOwner] = useState<Address | undefined>(owner);

  useEffect(() => {
    if (owner) {
      setResolvedOwner(owner);
    } else {
      token.signer.getAddress().then(setResolvedOwner);
    }
  }, [owner, token.signer]);

  const ownerKey = resolvedOwner ?? "";

  // Phase 1: Poll the encrypted handle (cheap RPC read, no signing)
  const handleQuery = useQuery<Address, Error>({
    queryKey: confidentialHandleQueryKeys.owner(tokenAddress, ownerKey),
    queryFn: () => token.confidentialBalanceOf(resolvedOwner!),
    enabled: !!resolvedOwner,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handle = handleQuery.data;

  // Phase 2: Decrypt only when handle changes (expensive relayer roundtrip)
  const balanceQuery = useQuery<bigint, Error>({
    queryKey: [...confidentialBalanceQueryKeys.owner(tokenAddress, ownerKey), handle ?? ""],
    queryFn: () => token.decryptBalance(handle!, resolvedOwner!),
    enabled: !!resolvedOwner && !!handle,
    staleTime: Infinity,
    ...balanceOptions,
  });

  return { ...balanceQuery, handleQuery };
}
