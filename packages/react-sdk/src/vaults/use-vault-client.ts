"use client";

import { createVaultClient, type VaultClient } from "@zama-fhe/sdk/vaults";
import { useMemo } from "react";
import { useZamaSDK } from "../provider";

/**
 * A {@link VaultClient} for the SDK in context. One client serves every group
 * and chain; its methods take the group or batch they act on.
 *
 * @returns A vault client bound to the SDK in context, the same one while that SDK stays.
 *
 * @example
 * ```tsx
 * const vaults = useVaultClient();
 * const prepared = await vaults.prepareDeposit(STABLE, { vaultId: "beta", account, amount });
 * ```
 */
export function useVaultClient(): VaultClient {
  const sdk = useZamaSDK();
  return useMemo(() => createVaultClient(sdk), [sdk]);
}
