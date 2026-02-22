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

/**
 * Query key factory for fee-related queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const feeQueryKeys = {
  /** Match wrap fee query for given parameters. */
  wrapFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
    ["wrapFee", feeManagerAddress, ...(amount !== undefined ? [amount, from, to] : [])] as const,
  /** Match unwrap fee query for given parameters. */
  unwrapFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
    ["unwrapFee", feeManagerAddress, ...(amount !== undefined ? [amount, from, to] : [])] as const,
  /** Match batch transfer fee query for a specific fee manager. */
  batchTransferFee: (feeManagerAddress: string) => ["batchTransferFee", feeManagerAddress] as const,
  /** Match fee recipient query for a specific fee manager. */
  feeRecipient: (feeManagerAddress: string) => ["feeRecipient", feeManagerAddress] as const,
} as const;

/** Configuration for {@link useWrapFee} and {@link useUnwrapFee}. */
export interface UseFeeConfig {
  /** Address of the fee manager contract. */
  feeManagerAddress: Address;
  /** Amount to calculate the fee for. */
  amount: bigint;
  /** Sender address. */
  from: Address;
  /** Receiver address. */
  to: Address;
}

/**
 * Read the wrap fee for a given amount and address pair.
 *
 * @param config - Fee manager address, amount, from, and to.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (the fee amount).
 *
 * @example
 * ```tsx
 * const { data: fee } = useWrapFee({
 *   feeManagerAddress: "0xFeeManager",
 *   amount: 1000n,
 *   from: "0xSender",
 *   to: "0xReceiver",
 * });
 * ```
 */
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

/**
 * Read the unwrap fee for a given amount and address pair.
 *
 * @param config - Fee manager address, amount, from, and to.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (the fee amount).
 *
 * @example
 * ```tsx
 * const { data: fee } = useUnwrapFee({
 *   feeManagerAddress: "0xFeeManager",
 *   amount: 1000n,
 *   from: "0xSender",
 *   to: "0xReceiver",
 * });
 * ```
 */
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

/**
 * Read the batch transfer fee from the fee manager.
 *
 * @param feeManagerAddress - Address of the fee manager contract.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (the fee amount).
 *
 * @example
 * ```tsx
 * const { data: fee } = useBatchTransferFee("0xFeeManager");
 * ```
 */
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

/**
 * Read the fee recipient address from the fee manager.
 *
 * @param feeManagerAddress - Address of the fee manager contract.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: Address` (the fee recipient).
 *
 * @example
 * ```tsx
 * const { data: recipient } = useFeeRecipient("0xFeeManager");
 * ```
 */
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
