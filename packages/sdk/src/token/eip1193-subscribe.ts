import type { Address } from "../relayer/relayer-sdk.types";
import type { SignerLifecycleCallbacks } from "./token.types";

/** Minimal EIP-1193 provider shape needed for lifecycle subscriptions. */
interface EIP1193Subscribable {
  on(event: string, listener: (...args: never[]) => void): void;
  removeListener(event: string, listener: (...args: never[]) => void): void;
}

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
  provider: EIP1193Subscribable | undefined,
  getAddress: () => Promise<Address>,
  { onDisconnect = () => {}, onAccountChange = () => {} }: SignerLifecycleCallbacks,
): () => void {
  if (!provider) return () => {};

  let currentAddress: string | undefined;
  getAddress()
    .then((addr) => {
      currentAddress = addr;
    })
    .catch(() => {});

  const handleAccountsChanged = (accounts: Address[]) => {
    if (accounts.length === 0) {
      currentAddress = undefined;
      return onDisconnect();
    }
    if (
      accounts[0] &&
      (!currentAddress || accounts[0].toLowerCase() !== currentAddress.toLowerCase())
    ) {
      onAccountChange(accounts[0]);
    }
    currentAddress = accounts[0];
  };

  provider.on("accountsChanged", handleAccountsChanged);
  provider.on("disconnect", onDisconnect);

  return () => {
    provider.removeListener("accountsChanged", handleAccountsChanged);
    provider.removeListener("disconnect", onDisconnect);
  };
}
