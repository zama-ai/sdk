"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  hashFn,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export const feeQueryKeys = zamaQueryKeys.fees;
export {
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
};

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
) {
  const sdk = useZamaSDK();

  return useQuery({
    ...shieldFeeQueryOptions(sdk.signer, config),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<bigint, Error>);
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
) {
  const sdk = useZamaSDK();

  return useQuery({
    ...unshieldFeeQueryOptions(sdk.signer, config),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<bigint, Error>);
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
) {
  const sdk = useZamaSDK();

  return useQuery({
    ...batchTransferFeeQueryOptions(sdk.signer, feeManagerAddress),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<bigint, Error>);
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
) {
  const sdk = useZamaSDK();

  return useQuery({
    ...feeRecipientQueryOptions(sdk.signer, feeManagerAddress),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<Address, Error>);
}
