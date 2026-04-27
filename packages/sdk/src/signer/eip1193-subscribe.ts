import {
  getAddress as checksumAddress,
  type Address,
  type EIP1193EventMap,
  type EIP1193Provider,
} from "viem";
import type { SignerIdentity, SignerIdentityListener } from "../types";

type MinimalProvider = Pick<EIP1193Provider, "on" | "removeListener">;

export interface Eip1193SubscribeConfig {
  provider: MinimalProvider | undefined;
  getInitialIdentity?: () => SignerIdentity | undefined | Promise<SignerIdentity | undefined>;
  onIdentityChange: SignerIdentityListener;
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
 * {@link SignerIdentityChange} transitions.
 *
 * Shared by `ViemSigner` and `EthersSigner`. Listeners are attached before the
 * adapter's initial identity loader runs; if any real provider event arrives
 * first, the stale loader result is ignored.
 */
export function eip1193Subscribe({
  provider,
  getInitialIdentity,
  onIdentityChange,
}: Eip1193SubscribeConfig): () => void {
  if (!provider) {
    return () => {};
  }

  let current: SignerIdentity | undefined;
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
    onIdentityChange({ previous, next });
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

  if (getInitialIdentity) {
    const initialEventVersion = eventVersion;
    Promise.resolve()
      .then(getInitialIdentity)
      .then((identity) => {
        if (!active || eventVersion !== initialEventVersion) {
          return;
        }
        current = identity;
        observedAddress = identity?.address;
        observedChainId = identity?.chainId;
      })
      .catch((error) => {
        // oxlint-disable-next-line no-console
        console.warn("[zama-sdk] initial identity load failed:", error);
      });
  }

  return () => {
    active = false;
    provider.removeListener("accountsChanged", handleAccountsChanged);
    provider.removeListener("disconnect", handleDisconnect);
    provider.removeListener("chainChanged", handleChainChanged);
  };
}
