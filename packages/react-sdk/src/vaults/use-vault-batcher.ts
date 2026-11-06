"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/sdk";
import {
  createVaultBatcher,
  type VaultBatcher,
  type VaultBatcherOptions,
} from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link VaultBatcher} instance for a single batcher contract,
 * memoized by address and chain. Low-level — most apps should use `useVault` instead.
 *
 * @param address - The batcher contract address (deposit or redeem direction).
 * @param options - `chainId` to read the batcher from another chain than the connected one.
 *
 * @example
 * ```tsx
 * const depositBatcher = useVaultBatcher("0xDepositBatcher");
 * ```
 */
export function useVaultBatcher(address: Address, options?: VaultBatcherOptions): VaultBatcher {
  const sdk = useZamaSDK();
  const chainId = options?.chainId;
  return useMemo<VaultBatcher>(
    () => createVaultBatcher(sdk, address, { chainId }),
    [sdk, address, chainId],
  );
}
