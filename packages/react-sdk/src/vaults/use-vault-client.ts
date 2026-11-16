"use client";

import { createVaultClient, type VaultClient } from "@zama-fhe/sdk/vaults";
import { useMemo } from "react";
import { useZamaSDK } from "../provider";

/**
 * A {@link VaultClient} for the SDK in context.
 *
 * @returns The same client while the SDK in context stays.
 */
export function useVaultClient(): VaultClient {
  const sdk = useZamaSDK();
  return useMemo(() => createVaultClient(sdk), [sdk]);
}
