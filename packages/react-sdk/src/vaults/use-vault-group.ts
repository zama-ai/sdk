"use client";

import { createVaultGroup, type VaultGroup, type VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { useMemo } from "react";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link VaultGroup} instance for a set of vaults sharing one confidential
 * asset. This is the surface to reach for; `useVault` covers a single vault
 * with no fan-out.
 *
 * @param config - The group: its asset, members and router.
 *
 * @remarks
 * Memoized on the config object's identity: hold it in a module constant or a
 * `useMemo`, or every render builds a new group.
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
