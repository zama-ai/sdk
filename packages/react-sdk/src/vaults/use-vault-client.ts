"use client";

import type { ZamaSDK } from "@zama-fhe/sdk";
import { createVaultClient, type VaultClient } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";

// One client per SDK, so every vault hook shares its cached reads (group checks, registry, decimals).
const clients = new WeakMap<ZamaSDK, VaultClient>();

/**
 * The {@link VaultClient} of the SDK in context, shared by every vault hook
 * on that SDK. One client serves every group and chain; its methods take the
 * group or batch they act on.
 *
 * @returns The SDK's vault client.
 *
 * @example
 * ```tsx
 * const vaults = useVaultClient();
 * const prepared = await vaults.prepareDeposit(STABLE, { vaultId: "beta", account, amount });
 * ```
 */
export function useVaultClient(): VaultClient {
  const sdk = useZamaSDK();
  let client = clients.get(sdk);
  if (client === undefined) {
    client = createVaultClient(sdk);
    clients.set(sdk, client);
  }
  return client;
}
