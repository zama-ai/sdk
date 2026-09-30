"use client";

import type { ZamaSDK } from "@zama-fhe/sdk";
import { createVaultGroup, type VaultGroup, type VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

// One group per SDK and config, shared by every hook that names the same
// group, so its token and batcher caches are not rebuilt per hook or render.
const groups = new WeakMap<ZamaSDK, Map<string, VaultGroup>>();

/**
 * Get a {@link VaultGroup} instance for a set of vaults sharing one confidential
 * asset. This is the surface to reach for; `useVault` covers a single vault
 * with no fan-out.
 *
 * @param config - The group: its `cAsset`, members and router.
 *
 * @remarks
 * Keyed on the config's contents, not its identity, so an inline config
 * object is fine. Hooks that name the same group share one instance.
 *
 * @example
 * ```tsx
 * const group = useVaultGroup(STABLE_GROUP);
 * ```
 */
export function useVaultGroup(config: VaultGroupConfig): VaultGroup {
  const sdk = useZamaSDK();
  let bySdk = groups.get(sdk);
  if (!bySdk) {
    bySdk = new Map();
    groups.set(sdk, bySdk);
  }
  const key = JSON.stringify(config);
  let group = bySdk.get(key);
  if (!group) {
    group = createVaultGroup(sdk, config);
    bySdk.set(key, group);
  }
  return group;
}
