// Dynamic authorizes the wallet; from then on wagmi alone owns the session through this
// connector, whose `connect()` never prompts — it reads the accounts the wallet already shares.
import { NetworkNotAddedError, type NetworkData } from "@dynamic-labs-sdk/client";
import type { EvmWalletProvider } from "@dynamic-labs-sdk/evm";
import { getAddress, type Address, type Chain, type EIP1193RequestFn } from "viem";
import {
  ChainNotConfiguredError,
  createConnector,
  type Config,
  type CreateConnectorFn,
} from "wagmi";
import { connect } from "wagmi/actions";

/** Dynamic's key for one way of reaching a wallet, such as `metamaskevm:browserExtension`. */
type WalletProviderKey = string;

export type DynamicWallet = Pick<
  EvmWalletProvider,
  | "getConnectedAddresses"
  | "getActiveNetworkId"
  | "request"
  | "events"
  | "switchActiveNetwork"
  | "addNetwork"
>;

/** Browser wallets register with Dynamic as they announce, so a lookup can miss on a reload. */
export interface DynamicWallets {
  find: (key: WalletProviderKey) => DynamicWallet | undefined;
  /** Waits until the wallet registers or is no longer expected to; `undefined` if it never did. */
  waitFor: (key: WalletProviderKey) => Promise<DynamicWallet | undefined>;
  /** Also fires when an EIP-6963 announcement replaces a wallet's injected `window.ethereum`. */
  onRegistered: (key: WalletProviderKey, listener: () => void) => () => void;
  displayName: (key: WalletProviderKey) => string;
  /** Removes the wallet's Dynamic accounts, which also closes a WalletConnect session. */
  release: (key: WalletProviderKey) => Promise<void>;
  toNetworkData: (chain: Chain) => NetworkData;
}

/** The wallet the connector last connected, kept in wagmi's storage so a reload restores it. */
interface SavedWallet {
  key: WalletProviderKey;
  name: string;
}

const SAVED_WALLET_STORAGE_KEY = "dynamic.lastWallet";
type SavedWalletStorage = Record<typeof SAVED_WALLET_STORAGE_KEY, SavedWallet>;

/** Anything unreadable counts as no saved wallet, so a bad record never blocks the page. */
export function readSavedWallet(
  storage: Storage,
  wagmiStorageKey: string,
): SavedWallet | undefined {
  try {
    const raw = storage.getItem(`${wagmiStorageKey}.${SAVED_WALLET_STORAGE_KEY}`);
    const parsed: unknown = raw === null ? undefined : JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "key" in parsed &&
      "name" in parsed &&
      typeof parsed.key === "string" &&
      typeof parsed.name === "string"
    ) {
      return { key: parsed.key, name: parsed.name };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

interface WalletListeners {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainId: string) => void;
  onDisconnect: () => void;
}

const checksummed = (addresses: readonly string[]): Address[] =>
  addresses.map((a) => getAddress(a));

function listenTo({ events }: DynamicWallet, listeners: WalletListeners): () => void {
  if (!events) return () => {};
  const onAccounts = ({ addresses }: { addresses: string[] }) =>
    listeners.onAccountsChanged(addresses);
  const onNetwork = ({ networkId }: { networkId: string }) => listeners.onChainChanged(networkId);
  events.on("accountsChanged", onAccounts);
  events.on("networkChanged", onNetwork);
  events.on("disconnected", listeners.onDisconnect);
  return () => {
    events.off("accountsChanged", onAccounts);
    events.off("networkChanged", onNetwork);
    events.off("disconnected", listeners.onDisconnect);
  };
}

/** Dynamic can replace the provider object under a key, so the listeners move with it. */
function followWallet(
  wallets: DynamicWallets,
  key: WalletProviderKey,
  initial: DynamicWallet,
  listeners: WalletListeners,
): () => void {
  let stopListening = listenTo(initial, listeners);
  const stopFollowing = wallets.onRegistered(key, () => {
    const replacement = wallets.find(key);
    if (!replacement) return;
    stopListening();
    stopListening = listenTo(replacement, listeners);
  });
  return () => {
    stopFollowing();
    stopListening();
  };
}

/** Through Dynamic, so a WalletConnect wallet's later requests also move to the new chain. */
async function switchWalletChain(wallet: DynamicWallet, chain: Chain, wallets: DynamicWallets) {
  const { switchActiveNetwork, addNetwork } = wallet;
  if (!switchActiveNetwork) throw new Error("The wallet cannot switch networks");
  const networkId = String(chain.id);
  try {
    await switchActiveNetwork({ networkId });
    return;
  } catch (error) {
    if (!(error instanceof NetworkNotAddedError) || !addNetwork) throw error;
  }
  await addNetwork({ networkData: wallets.toNetworkData(chain) });
  await switchActiveNetwork({ networkId });
}

export function dynamicConnector(
  wallets: DynamicWallets,
  { key, name }: SavedWallet,
): CreateConnectorFn<{ request: EIP1193RequestFn }, Record<string, unknown>, SavedWalletStorage> {
  return createConnector((config) => {
    let stopFollowing: (() => void) | undefined;
    const stop = () => {
      stopFollowing?.();
      stopFollowing = undefined;
    };

    // On a reload the wallet can register after wagmi starts reconnecting, so this waits.
    const provider = async (): Promise<DynamicWallet> => {
      const found = await wallets.waitFor(key);
      if (!found) throw new Error(`Wallet "${name}" is not available`);
      return found;
    };

    const listeners: WalletListeners = {
      onAccountsChanged: (accounts) => {
        if (accounts.length === 0) listeners.onDisconnect();
        else config.emitter.emit("change", { accounts: checksummed(accounts) });
      },
      onChainChanged: (chainId) => config.emitter.emit("change", { chainId: Number(chainId) }),
      onDisconnect: () => {
        stop();
        config.emitter.emit("disconnect");
      },
    };

    return {
      id: key,
      name,
      type: "dynamic",

      async connect({ withCapabilities } = {}) {
        const wallet = await provider();
        const { addresses } = await wallet.getConnectedAddresses();
        if (addresses.length === 0) throw new Error(`Wallet "${name}" has not authorized this app`);
        stopFollowing ??= followWallet(wallets, key, wallet, listeners);
        const { networkId } = await wallet.getActiveNetworkId();
        await config.storage?.setItem(SAVED_WALLET_STORAGE_KEY, { key, name });
        const accounts = checksummed(addresses);
        return {
          // wagmi types `accounts` by the caller's `withCapabilities` flag, which this honors.
          accounts: (withCapabilities
            ? accounts.map((address) => ({ address, capabilities: {} }))
            : accounts) as never,
          chainId: Number(networkId),
        };
      },

      async disconnect() {
        stop();
        await config.storage?.removeItem(SAVED_WALLET_STORAGE_KEY);
        // Never Dynamic's `logout()`: in SDK 1.47 it strips every listener from `window.ethereum`.
        await wallets.release(key).catch((error: unknown) => {
          console.warn("Could not release the wallet", error);
        });
      },

      async getAccounts() {
        const { addresses } = await (await provider()).getConnectedAddresses();
        return checksummed(addresses);
      },

      async getChainId() {
        const { networkId } = await (await provider()).getActiveNetworkId();
        return Number(networkId);
      },

      async getProvider() {
        const { request } = await provider();
        if (!request) throw new Error(`Wallet "${name}" has no request method`);
        // Dynamic types `request` with its own EIP-1193 signature, structurally viem's.
        return { request: request as EIP1193RequestFn };
      },

      async isAuthorized() {
        const wallet = await wallets.waitFor(key);
        if (!wallet) return false;
        const { addresses } = await wallet.getConnectedAddresses();
        return addresses.length > 0;
      },

      async switchChain({ chainId }) {
        const chain = config.chains.find((candidate) => candidate.id === chainId);
        if (!chain) throw new ChainNotConfiguredError();
        await switchWalletChain(await provider(), chain, wallets);
        // The wallet's own chain event repeats this, which leaves wagmi's state as it is.
        config.emitter.emit("change", { chainId });
        return chain;
      },

      ...listeners,
    };
  });
}

export async function connectDynamicWallet(
  config: Config,
  wallets: DynamicWallets,
  key: WalletProviderKey,
): Promise<void> {
  let connector = config.connectors.find(({ id }) => id === key);
  if (!connector) {
    // Listed the way wagmi lists the wallets it discovers itself, so a later `reconnect`
    // finds it too. wagmi has no public API for this.
    const { connectors } = config._internal;
    connector = connectors.setup(
      dynamicConnector(wallets, { key, name: wallets.displayName(key) }),
    );
    connectors.setState((current) => [...current, connector!]);
  }
  await connect(config, { connector });
}
