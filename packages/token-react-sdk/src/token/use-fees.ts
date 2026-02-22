"use client";

import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import {
  getWrapFeeContract,
  getUnwrapFeeContract,
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  type Hex,
} from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

export const feeQueryKeys = {
  wrapFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
    ["wrapFee", feeManagerAddress, ...(amount !== undefined ? [amount, from, to] : [])] as const,
  unwrapFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
    ["unwrapFee", feeManagerAddress, ...(amount !== undefined ? [amount, from, to] : [])] as const,
  batchTransferFee: (feeManagerAddress: string) => ["batchTransferFee", feeManagerAddress] as const,
  feeRecipient: (feeManagerAddress: string) => ["feeRecipient", feeManagerAddress] as const,
} as const;

export interface UseFeeConfig {
  feeManagerAddress: Hex;
  amount: bigint;
  from: Hex;
  to: Hex;
}

export function useWrapFee(
  config: UseFeeConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const { feeManagerAddress, amount, from, to } = config;
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<bigint, Error>({
    queryKey: feeQueryKeys.wrapFee(feeManagerAddress, amount.toString(), from, to),
    queryFn: () =>
      token.signer.readContract<bigint>(getWrapFeeContract(feeManagerAddress, amount, from, to)),
    staleTime: 30_000,
    ...options,
  });
}

export function useUnwrapFee(
  config: UseFeeConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const { feeManagerAddress, amount, from, to } = config;
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<bigint, Error>({
    queryKey: feeQueryKeys.unwrapFee(feeManagerAddress, amount.toString(), from, to),
    queryFn: () =>
      token.signer.readContract<bigint>(getUnwrapFeeContract(feeManagerAddress, amount, from, to)),
    staleTime: 30_000,
    ...options,
  });
}

export function useBatchTransferFee(
  feeManagerAddress: Hex,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<bigint, Error>({
    queryKey: feeQueryKeys.batchTransferFee(feeManagerAddress),
    queryFn: () =>
      token.signer.readContract<bigint>(getBatchTransferFeeContract(feeManagerAddress)),
    staleTime: 30_000,
    ...options,
  });
}

export function useFeeRecipient(
  feeManagerAddress: Hex,
  options?: Omit<UseQueryOptions<Hex, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Hex, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<Hex, Error>({
    queryKey: feeQueryKeys.feeRecipient(feeManagerAddress),
    queryFn: () => token.signer.readContract<Hex>(getFeeRecipientContract(feeManagerAddress)),
    staleTime: 30_000,
    ...options,
  });
}
