import {
  getAddress as checksumAddress,
  type Address,
  type EIP1193EventMap,
  type EIP1193Provider,
} from "viem";
import type { WalletAccount, WalletAccountListener } from "../types";

type MinimalProvider = Pick<EIP1193Provider, "on" | "removeListener">;

export interface Eip1193SubscribeConfig {
  provider: MinimalProvider | undefined;
  getInitialWalletAccount?: () => WalletAccount | undefined | Promise<WalletAccount | undefined>;
  onWalletAccountChange: WalletAccountListener;
}

function normalizeAddress(address: Address | undefined): Address | undefined {
  if (!address) {
    return undefined;
  }
  try {
    return checksumAddress(address);
  } catch {
    return undefined;
  }
}

function parseChainId(chainId: string): number | undefined {
  const parsed = Number(chainId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Subscribe to EIP-1193 wallet events and translate them into
 * {@link WalletAccountChange} transitions.
 *
 * Shared by `ViemSigner` and `EthersSigner`. Listeners are attached before the
 * adapter's initial identity loader runs; if any real provider event arrives
 * first, the stale loader result is ignored.
 */
export function eip1193Subscribe({
  provider,
  getInitialWalletAccount,
  onWalletAccountChange,
}: Eip1193SubscribeConfig): () => void {
  if (!provider) {
    return () => {};
  }

  let current: WalletAccount | undefined;
  let observedAddress: Address | undefined;
  let observedChainId: number | undefined;
  let active = true;
  let eventVersion = 0;

  function markEvent(): void {
    eventVersion += 1;
  }

  function reconcile(): void {
    if (!active) {
      return;
    }
    const next =
      observedAddress && observedChainId !== undefined
        ? { address: observedAddress, chainId: observedChainId }
        : undefined;
    if (current?.address === next?.address && current?.chainId === next?.chainId) {
      return;
    }
    const previous = current;
    current = next;
    onWalletAccountChange({ previous, next });
  }

  const handleAccountsChanged: EIP1193EventMap["accountsChanged"] = (accounts) => {
    markEvent();
    if (accounts.length === 0 || !accounts[0]) {
      observedAddress = undefined;
      observedChainId = undefined;
      reconcile();
      return;
    }

    const nextAddress = normalizeAddress(accounts[0]);
    if (!nextAddress) {
      return;
    }

    observedAddress = nextAddress;
    reconcile();
  };

  const handleDisconnect: EIP1193EventMap["disconnect"] = () => {
    markEvent();
    observedAddress = undefined;
    observedChainId = undefined;
    reconcile();
  };

  const handleChainChanged: EIP1193EventMap["chainChanged"] = (chainId) => {
    markEvent();
    const nextChainId = parseChainId(chainId);
    if (!nextChainId) {
      return;
    }

    observedChainId = nextChainId;
    reconcile();
  };

  provider.on("accountsChanged", handleAccountsChanged);
  provider.on("disconnect", handleDisconnect);
  provider.on("chainChanged", handleChainChanged);

  if (getInitialWalletAccount) {
    const initialEventVersion = eventVersion;
    Promise.resolve()
      .then(getInitialWalletAccount)
      .then((account) => {
        if (!active || eventVersion !== initialEventVersion) {
          return;
        }
        current = account;
        observedAddress = account?.address;
        observedChainId = account?.chainId;
        onWalletAccountChange({ previous: undefined, next: account });
      })
      .catch(() => {
        // Best-effort initial identity load. The failure is non-fatal: real
        // provider events reconcile wallet-account state, so it is swallowed
        // silently rather than emitted to the console.
      });
  }

  return () => {
    active = false;
    provider.removeListener("accountsChanged", handleAccountsChanged);
    provider.removeListener("disconnect", handleDisconnect);
    provider.removeListener("chainChanged", handleChainChanged);
  };
}
