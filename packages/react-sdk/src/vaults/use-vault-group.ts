"use client";

import { useMemo } from "react";
import { createVaultGroup, type VaultGroup, type VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link VaultGroup} instance for a set of vaults sharing one confidential
 * asset, memoized by the config's contents, so a config rebuilt each render
 * keeps one group. `useVault` covers a single vault.
 *
 * @param config - The group: its `cAsset`, `router` and members.
 *
 * @example
 * ```tsx
 * const group = useVaultGroup(STABLE_GROUP);
 * ```
 */
export function useVaultGroup(config: VaultGroupConfig): VaultGroup {
  const sdk = useZamaSDK();
  // Rebuilt from the key so the memo depends on the config's contents, not its identity.
  const key = JSON.stringify({
    id: config.id,
    cAsset: config.cAsset,
    router: config.router,
    vaults: config.vaults.map(({ id, vault, depositBatcher, redeemBatcher }) => ({
      id,
      vault,
      depositBatcher,
      redeemBatcher,
    })),
  });
  return useMemo<VaultGroup>(
    () => createVaultGroup(sdk, JSON.parse(key) as VaultGroupConfig),
    [sdk, key],
  );
}
