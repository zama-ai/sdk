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

export function useWrapFee(
  feeManagerAddress: Address,
  amount: bigint,
  from: Address,
  to: Address,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<bigint, Error>({
    queryKey: ["wrapFee", feeManagerAddress, amount.toString(), from, to],
    queryFn: () =>
      token.signer.readContract<bigint>(getWrapFeeContract(feeManagerAddress, amount, from, to)),
    ...options,
  });
}

export function useUnwrapFee(
  feeManagerAddress: Address,
  amount: bigint,
  from: Address,
  to: Address,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<bigint, Error>({
    queryKey: ["unwrapFee", feeManagerAddress, amount.toString(), from, to],
    queryFn: () =>
      token.signer.readContract<bigint>(getUnwrapFeeContract(feeManagerAddress, amount, from, to)),
    ...options,
  });
}

export function useBatchTransferFee(
  feeManagerAddress: Address,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<bigint, Error>({
    queryKey: ["batchTransferFee", feeManagerAddress],
    queryFn: () =>
      token.signer.readContract<bigint>(getBatchTransferFeeContract(feeManagerAddress)),
    ...options,
  });
}

export function useFeeRecipient(
  feeManagerAddress: Address,
  options?: Omit<UseQueryOptions<Address, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address, Error> {
  const token = useReadonlyToken(feeManagerAddress);

  return useQuery<Address, Error>({
    queryKey: ["feeRecipient", feeManagerAddress],
    queryFn: () => token.signer.readContract<Address>(getFeeRecipientContract(feeManagerAddress)),
    ...options,
  });
}
