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
import { useZamaSDK } from "../provider";

/**
 * Query key factory for fee-related queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const feeQueryKeys = {
  /** Match shield fee query for given parameters. */
  shieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
    ["shieldFee", feeManagerAddress, ...(amount !== undefined ? [amount, from, to] : [])] as const,
  /** Match unshield fee query for given parameters. */
  unshieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
    [
      "unshieldFee",
      feeManagerAddress,
      ...(amount !== undefined ? [amount, from, to] : []),
    ] as const,
  /** Match batch transfer fee query for a specific fee manager. */
  batchTransferFee: (feeManagerAddress: string) => ["batchTransferFee", feeManagerAddress] as const,
  /** Match fee recipient query for a specific fee manager. */
  feeRecipient: (feeManagerAddress: string) => ["feeRecipient", feeManagerAddress] as const,
} as const;

/** Configuration for {@link useShieldFee} and {@link useUnshieldFee}. */
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
 * TanStack Query options factory for shield fee.
 *
 * @param signer - A `GenericSigner` instance.
 * @param config - {@link UseFeeConfig} with fee manager address, amount, from, and to.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function shieldFeeQueryOptions(signer: GenericSigner, config: UseFeeConfig) {
  const { feeManagerAddress, amount, from, to } = config;
  return {
    queryKey: feeQueryKeys.shieldFee(feeManagerAddress, amount.toString(), from, to),
    queryFn: () =>
      signer.readContract<bigint>(getWrapFeeContract(feeManagerAddress, amount, from, to)),
    staleTime: 30_000,
  } as const;
}

/**
 * TanStack Query options factory for unshield fee.
 *
 * @param signer - A `GenericSigner` instance.
 * @param config - Fee manager address, amount, from, and to.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function unshieldFeeQueryOptions(signer: GenericSigner, config: UseFeeConfig) {
  const { feeManagerAddress, amount, from, to } = config;
  return {
    queryKey: feeQueryKeys.unshieldFee(feeManagerAddress, amount.toString(), from, to),
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
 * Read the shield fee for a given amount and address pair.
 *
 * @param config - Fee manager address, amount, from, and to.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (the fee amount).
 *
 * @example
 * ```tsx
 * const { data: fee } = useShieldFee({
 *   feeManagerAddress: "0xFeeManager",
 *   amount: 1000n,
 *   from: "0xSender",
 *   to: "0xReceiver",
 * });
 * ```
 */
export function useShieldFee(
  config: UseFeeConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const sdk = useZamaSDK();

  return useQuery<bigint, Error>({
    ...shieldFeeQueryOptions(sdk.requireSigner(), config),
    ...options,
  });
}

/**
 * Read the unshield fee for a given amount and address pair.
 *
 * @param config - Fee manager address, amount, from, and to.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (the fee amount).
 *
 * @example
 * ```tsx
 * const { data: fee } = useUnshieldFee({
 *   feeManagerAddress: "0xFeeManager",
 *   amount: 1000n,
 *   from: "0xSender",
 *   to: "0xReceiver",
 * });
 * ```
 */
export function useUnshieldFee(
  config: UseFeeConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const sdk = useZamaSDK();

  return useQuery<bigint, Error>({
    ...unshieldFeeQueryOptions(sdk.requireSigner(), config),
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
  const sdk = useZamaSDK();

  return useQuery<bigint, Error>({
    ...batchTransferFeeQueryOptions(sdk.requireSigner(), feeManagerAddress),
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
  const sdk = useZamaSDK();

  return useQuery<Address, Error>({
    ...feeRecipientQueryOptions(sdk.requireSigner(), feeManagerAddress),
    ...options,
  });
}
