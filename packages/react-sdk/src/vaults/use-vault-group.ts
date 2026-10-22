"use client";

import { useMemo } from "react";
import { createVaultGroup, type VaultGroup, type VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link VaultGroup} instance for a set of vaults sharing one confidential
 * asset, memoized by config. Pass a stable config object (a module constant or
 * a memoized value): a fresh object each render rebuilds the group and its
 * cached reads. `useVault` covers a single vault.
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
  return useMemo<VaultGroup>(() => createVaultGroup(sdk, config), [sdk, config]);
}
