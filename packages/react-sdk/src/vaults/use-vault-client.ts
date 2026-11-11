"use client";

import { useMemo } from "react";
import { createVaultClient, type VaultClient } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * The {@link VaultClient} of the SDK in context, memoized per SDK. One client
 * serves every group and chain; methods take the group or batch they act on.
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
