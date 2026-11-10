"use client";

import { useMemo } from "react";
import { createVaultClient, type VaultClient, type VaultsConfig } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * The {@link VaultClient} for a {@link defineVaults} config, memoized per SDK
 * and config. Define the config once at module level so it keeps its identity.
 *
 * @example
 * ```tsx
 * const client = useVaultClient(VAULTS);
 * const prepared = await client.prepareDeposit({ groupId: "stable", vaultId: "beta", amount });
 * ```
 */
export function useVaultClient<const TConfig extends VaultsConfig>(
  config: TConfig,
): VaultClient<TConfig> {
  const sdk = useZamaSDK();
  return useMemo(() => createVaultClient(sdk, config), [sdk, config]);
}
