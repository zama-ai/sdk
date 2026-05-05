"use client";

import { useSyncExternalStore } from "react";
import type { WalletAccount, ZamaSDK } from "@zama-fhe/sdk";

export function useWalletAccount(sdk: ZamaSDK): WalletAccount | undefined {
  return useSyncExternalStore(
    (listener) => sdk.onWalletAccountChange(listener),
    () => sdk.signer?.walletAccount.getSnapshot(),
    () => undefined,
  );
}
