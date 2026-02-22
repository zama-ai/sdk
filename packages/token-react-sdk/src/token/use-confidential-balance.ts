"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";
import { confidentialBalanceQueryKeys, confidentialHandleQueryKeys } from "./balance-query-keys";

interface UseConfidentialBalanceOptions extends Omit<
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
  const token = useReadonlyToken(tokenAddress);
  const { handleRefetchInterval, ...balanceOptions } = options ?? {};

  // Phase 1: Poll the encrypted handle (cheap RPC read, no signing)
  const handleQuery = useQuery<Address, Error>({
    queryKey: confidentialHandleQueryKeys.owner(tokenAddress, owner ?? ""),
    queryFn: async () => {
      const ownerAddress = owner ?? (await token.signer.getAddress());
      return token.confidentialBalanceOf(ownerAddress);
    },
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handle = handleQuery.data;

  // Phase 2: Decrypt only when handle changes (expensive relayer roundtrip)
  const balanceQuery = useQuery<bigint, Error>({
    queryKey: [...confidentialBalanceQueryKeys.owner(tokenAddress, owner ?? ""), handle ?? ""],
    queryFn: async () => {
      if (!handle) return BigInt(0);
      const ownerAddress = owner ?? (await token.signer.getAddress());
      return token.decryptBalance(handle, ownerAddress);
    },
    enabled: handle !== undefined,
    staleTime: Infinity,
    ...balanceOptions,
  });

  return balanceQuery;
}
