"use client";

import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import {
  getWrapFeeContract,
  getUnwrapFeeContract,
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  type Address,
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
  feeManagerAddress: Address;
  amount: bigint;
  from: Address;
  to: Address;
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
  feeManagerAddress: Address,
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
  feeManagerAddress: Address,
  options?: Omit<UseQueryOptions<Address, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<Address, Error>({
    queryKey: feeQueryKeys.feeRecipient(feeManagerAddress),
    queryFn: () => token.signer.readContract<Address>(getFeeRecipientContract(feeManagerAddress)),
    staleTime: 30_000,
    ...options,
  });
}
