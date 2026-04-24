import {
  getAddress as checksumAddress,
  type Address,
  type EIP1193EventMap,
  type EIP1193Provider,
} from "viem";
import type { SignerIdentity, SignerIdentityListener } from "../types";

type MinimalProvider = Pick<EIP1193Provider, "on" | "removeListener">;

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
 * Shared by `ViemSigner` and `EthersSigner`. The helper maintains a local
 * identity snapshot derived only from observed events. It never probes the
 * live signer to complete a lifecycle transition.
 */
export function eip1193Subscribe(
  provider: MinimalProvider | undefined,
  onIdentityChange: SignerIdentityListener,
): () => void {
  if (!provider) {
    return () => {};
  }

  let current: SignerIdentity | undefined;
  let observedAddress: Address | undefined;
  let observedChainId: number | undefined;

  function emit(next: SignerIdentity | undefined): void {
    if (!next && !current) {
      return;
    }
    const previous = current;
    current = next;
    onIdentityChange({ previous, next });
  }

  const handleAccountsChanged: EIP1193EventMap["accountsChanged"] = (accounts) => {
    if (accounts.length === 0 || !accounts[0]) {
      observedAddress = undefined;
      emit(undefined);
      return;
    }

    const nextAddress = normalizeAddress(accounts[0]);
    if (!nextAddress) {
      return;
    }

    observedAddress = nextAddress;
    const chainId = current?.chainId ?? observedChainId;
    if (chainId === undefined) {
      return;
    }
    if (current && nextAddress === current.address) {
      return;
    }

    emit({ address: nextAddress, chainId });
  };

  const handleDisconnect: EIP1193EventMap["disconnect"] = () => {
    observedAddress = undefined;
    emit(undefined);
  };

  const handleChainChanged: EIP1193EventMap["chainChanged"] = (chainId) => {
    const nextChainId = parseChainId(chainId);
    if (!nextChainId) {
      return;
    }

    observedChainId = nextChainId;
    if (current && nextChainId === current.chainId) {
      return;
    }

    const nextAddress = current?.address ?? observedAddress;
    if (!nextAddress) {
      return;
    }

    emit({ address: nextAddress, chainId: nextChainId });
  };

  provider.on("accountsChanged", handleAccountsChanged);
  provider.on("disconnect", handleDisconnect);
  provider.on("chainChanged", handleChainChanged);

  return () => {
    provider.removeListener("accountsChanged", handleAccountsChanged);
    provider.removeListener("disconnect", handleDisconnect);
    provider.removeListener("chainChanged", handleChainChanged);
  };
}
