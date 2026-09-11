"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/sdk";
import { VaultBatcher } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link VaultBatcher} instance for a single batcher contract,
 * memoized by address. Low-level — most apps should use `useVault` instead.
 *
 * @param address - The batcher contract address (deposit or redeem direction).
 * @returns A memoized `VaultBatcher` instance.
 *
 * @example
 * ```tsx
 * const depositBatcher = useVaultBatcher("0xDepositBatcher");
 * ```
 */
export function useVaultBatcher(address: Address): VaultBatcher {
  const sdk = useZamaSDK();
  return useMemo<VaultBatcher>(() => new VaultBatcher(sdk, address), [sdk, address]);
}
