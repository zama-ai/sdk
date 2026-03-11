"use client";

import { useQuery } from "../utils/query";
import { type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

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
  const baseOpts = shieldFeeQueryOptions(sdk.signer, config);

  return useQuery<bigint>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
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
) {
  const sdk = useZamaSDK();
  const baseOpts = unshieldFeeQueryOptions(sdk.signer, config);

  return useQuery<bigint>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
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
) {
  const sdk = useZamaSDK();
  const baseOpts = batchTransferFeeQueryOptions(sdk.signer, feeManagerAddress);

  return useQuery<bigint>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
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
) {
  const sdk = useZamaSDK();
  const baseOpts = feeRecipientQueryOptions(sdk.signer, feeManagerAddress);

  return useQuery<Address>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
