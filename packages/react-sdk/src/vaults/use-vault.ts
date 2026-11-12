"use client";

import { useMemo } from "react";
import {
  createVault,
  type Vault,
  type VaultAddresses,
  type VaultBatcherOptions,
} from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link Vault} instance for the given deposit/redeem batcher pair,
 * memoized by address and chain. Most apps should use this — see `useVaultBatcher`
 * for direct single-direction access.
 *
 * @param addresses - The vault, deposit batcher, and redeem batcher contract addresses.
 * @param options - `chainId` to read both batchers from another chain than the connected one.
 *
 * @example
 * ```tsx
 * const vault = useVault({
 *   vault: "0xVault",
 *   depositBatcher: "0xDepositBatcher",
 *   redeemBatcher: "0xRedeemBatcher",
 * });
 * ```
 */
export function useVault(addresses: VaultAddresses, options?: VaultBatcherOptions): Vault {
  const sdk = useZamaSDK();
  const { vault, depositBatcher, redeemBatcher } = addresses;
  const chainId = options?.chainId;
  return useMemo<Vault>(
    () => createVault(sdk, { vault, depositBatcher, redeemBatcher }, { chainId }),
    [sdk, vault, depositBatcher, redeemBatcher, chainId],
  );
}
