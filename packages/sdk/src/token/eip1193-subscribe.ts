import {
  getAddress as checksumAddress,
  type Address,
  type EIP1193EventMap,
  type EIP1193Provider,
} from "viem";
import type { SignerLifecycleCallbacks } from "./token.types";

/**
 * Subscribe to EIP-1193 wallet lifecycle events on a raw provider.
 * Shared by `ViemSigner` and `EthersSigner` to avoid duplicating the
 * `accountsChanged` / `disconnect` wiring.
 *
 * @param provider - An EIP-1193 provider, or `undefined` if unavailable.
 * @param getAddress - Async function returning the current wallet address.
 * @param callbacks - Lifecycle callbacks to invoke on disconnect or account change.
 * @returns An unsubscribe function (no-op when provider is undefined).
 */
export function eip1193Subscribe(
  provider: Pick<EIP1193Provider, "on" | "removeListener"> | undefined,
  getAddress: () => Promise<Address>,
  { onDisconnect = () => {}, onAccountChange = () => {}, onChainChange }: SignerLifecycleCallbacks,
): () => void {
  if (!provider) {
    return () => {};
  }

  let currentAddress: Address | undefined;
  getAddress()
    .then((addr) => {
      currentAddress = addr;
    })
    .catch(() => {});

  const handleAccountsChanged: EIP1193EventMap["accountsChanged"] = (accounts) => {
    if (accounts.length === 0) {
      currentAddress = undefined;
      return onDisconnect();
    }
    if (!accounts[0]) {
      return;
    }
    let nextAddress: Address;
    try {
      nextAddress = checksumAddress(accounts[0]);
    } catch {
      return;
    }
    if (!currentAddress || nextAddress !== currentAddress) {
      onAccountChange(nextAddress);
    }
    currentAddress = nextAddress;
  };
  const handleDisconnect: EIP1193EventMap["disconnect"] = () => onDisconnect();
  const handleChainChanged = onChainChange
    ? (chainId: string) => onChainChange(Number.parseInt(chainId, 16))
    : undefined;

  provider.on("accountsChanged", handleAccountsChanged);
  provider.on("disconnect", handleDisconnect);
  if (handleChainChanged) {
    (provider as EIP1193Provider).on(
      "chainChanged",
      handleChainChanged as EIP1193EventMap["chainChanged"],
    );
  }

  return () => {
    provider.removeListener("accountsChanged", handleAccountsChanged);
    provider.removeListener("disconnect", handleDisconnect);
    if (handleChainChanged) {
      (provider as EIP1193Provider).removeListener(
        "chainChanged",
        handleChainChanged as EIP1193EventMap["chainChanged"],
      );
    }
  };
}
