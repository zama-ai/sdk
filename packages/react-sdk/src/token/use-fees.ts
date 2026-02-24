"use client";

import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import {
  getWrapFeeContract,
  getUnwrapFeeContract,
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  type Address,
  type GenericSigner,
} from "@zama-fhe/sdk";
import { useTokenSDK } from "../provider";

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
 * TanStack Query options factory for wrap fee.
 *
 * @param signer - A `GenericSigner` instance.
 * @param config - {@link UseFeeConfig} with fee manager address, amount, from, and to.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function wrapFeeQueryOptions(signer: GenericSigner, config: UseFeeConfig) {
  const { feeManagerAddress, amount, from, to } = config;
  return {
    queryKey: feeQueryKeys.wrapFee(feeManagerAddress, amount.toString(), from, to),
    queryFn: () =>
      signer.readContract<bigint>(getWrapFeeContract(feeManagerAddress, amount, from, to)),
    staleTime: 30_000,
  } as const;
}

/**
 * TanStack Query options factory for unwrap fee.
 *
 * @param signer - A `GenericSigner` instance.
 * @param config - Fee manager address, amount, from, and to.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function unwrapFeeQueryOptions(signer: GenericSigner, config: UseFeeConfig) {
  const { feeManagerAddress, amount, from, to } = config;
  return {
    queryKey: feeQueryKeys.unwrapFee(feeManagerAddress, amount.toString(), from, to),
    queryFn: () =>
      signer.readContract<bigint>(getUnwrapFeeContract(feeManagerAddress, amount, from, to)),
    staleTime: 30_000,
  } as const;
}

/**
 * TanStack Query options factory for batch transfer fee.
 *
 * @param signer - A `GenericSigner` instance.
 * @param feeManagerAddress - Address of the fee manager contract.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function batchTransferFeeQueryOptions(signer: GenericSigner, feeManagerAddress: Address) {
  return {
    queryKey: feeQueryKeys.batchTransferFee(feeManagerAddress),
    queryFn: () => signer.readContract<bigint>(getBatchTransferFeeContract(feeManagerAddress)),
    staleTime: 30_000,
  } as const;
}

/**
 * TanStack Query options factory for fee recipient.
 *
 * @param signer - A `GenericSigner` instance.
 * @param feeManagerAddress - Address of the fee manager contract.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function feeRecipientQueryOptions(signer: GenericSigner, feeManagerAddress: Address) {
  return {
    queryKey: feeQueryKeys.feeRecipient(feeManagerAddress),
    queryFn: () => signer.readContract<Address>(getFeeRecipientContract(feeManagerAddress)),
    staleTime: 30_000,
  } as const;
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
  const sdk = useTokenSDK();

  return useQuery<bigint, Error>({
    ...wrapFeeQueryOptions(sdk.signer, config),
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
  const sdk = useTokenSDK();

  return useQuery<bigint, Error>({
    ...unwrapFeeQueryOptions(sdk.signer, config),
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
  const sdk = useTokenSDK();

  return useQuery<bigint, Error>({
    ...batchTransferFeeQueryOptions(sdk.signer, feeManagerAddress),
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
  const sdk = useTokenSDK();

  return useQuery<Address, Error>({
    ...feeRecipientQueryOptions(sdk.signer, feeManagerAddress),
    ...options,
  });
}
