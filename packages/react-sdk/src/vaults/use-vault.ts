"use client";

import { useMemo } from "react";
import { createVault, type Vault, type VaultAddresses } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link Vault} instance for the given deposit/redeem batcher pair,
 * memoized by address. Most apps should use this — see `useVaultBatcher`
 * for direct single-direction access.
 *
 * @param addresses - The vault, deposit batcher, and redeem batcher contract addresses.
 * @returns A memoized `Vault` instance.
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
export function useVault(addresses: VaultAddresses): Vault {
  const sdk = useZamaSDK();
  const { vault, depositBatcher, redeemBatcher } = addresses;
  return useMemo<Vault>(
    () => createVault(sdk, { vault, depositBatcher, redeemBatcher }),
    [sdk, vault, depositBatcher, redeemBatcher],
  );
}
