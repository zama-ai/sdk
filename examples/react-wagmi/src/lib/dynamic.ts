// Dynamic's headless SDK, connect-only (no sign-in, no embedded wallet): it supplies the wallet
// catalogue, the connect step and each wallet's EIP-1193 provider. wagmi owns the session.
import {
  connectWalletOption,
  createDynamicClient,
  getWalletAccounts,
  getWalletOptionsCatalogue,
  getWalletProviderDataByKey,
  onEvent,
  removeWalletAccount,
  waitForClientInitialized,
  type DynamicClient,
  type NetworkData,
  type WalletAccount,
  type WalletOption,
} from "@dynamic-labs-sdk/client";
import { getWalletProviders } from "@dynamic-labs-sdk/client/core";
import { isEvmWalletProvider } from "@dynamic-labs-sdk/evm/core";
import { addEIP6963Extension } from "@dynamic-labs-sdk/evm/eip6963";
import {
  addWalletConnectEvmExtension,
  connectWithWalletConnectEvm,
} from "@dynamic-labs-sdk/evm/wallet-connect";
import { addEvmWindowInjectedExtension } from "@dynamic-labs-sdk/evm/window-injected";
import type { Chain } from "viem";
import type { Config } from "wagmi";
import { NETWORK_KEYS, networks } from "@/lib/networks";
import {
  connectDynamicWallet,
  type DynamicWallet,
  type DynamicWallets,
} from "@/lib/dynamicConnector";

// || not ??: Next.js inlines unset NEXT_PUBLIC_* variables as "" at build time.
export const DYNAMIC_ENVIRONMENT_ID = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "";

/**
 * Dynamic has no "all wallets announced" signal, so a reload waits this long for a saved
 * browser wallet. The wait ends as soon as it announces.
 */
const BROWSER_WALLET_WAIT_MS = 3000;

/** Dynamic's catalogue lists WalletConnect with no connection option, so the app pairs it. */
export const WALLETCONNECT_KEY = "walletconnect";

interface Dynamic {
  client: DynamicClient;
  wallets: DynamicWallets;
  initialized: Promise<boolean>;
}

let dynamic: Dynamic | undefined;

function toNetworkData(chain: Chain): NetworkData {
  return {
    chain: "EVM",
    networkId: String(chain.id),
    name: `evm-${chain.id}`,
    displayName: chain.name,
    // Required by Dynamic; the app never renders Dynamic's network UI.
    iconUrl: `${window.location.origin}/favicon.ico`,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: { http: [...chain.rpcUrls.default.http] },
    blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
    testnet: chain.testnet === true,
  };
}

function createWallets(
  client: DynamicClient,
  stopWaiting: (key: string) => Promise<unknown>,
): DynamicWallets {
  const find = (key: string): DynamicWallet | undefined => {
    const provider = getWalletProviders(client).find((candidate) => candidate.key === key);
    if (!provider) return undefined;
    if (!isEvmWalletProvider(provider) || !provider.request) {
      throw new Error(`Dynamic provider "${key}" is not an EIP-1193 EVM provider`);
    }
    return provider;
  };

  const onRegistered = (key: string, listener: () => void) =>
    onEvent(
      {
        event: "walletProviderChanged",
        listener: (event) => {
          if (event.walletProviderKey === key) listener();
        },
      },
      client,
    );

  const waitFor = async (key: string) => {
    const present = find(key);
    if (present) return present;
    let unsubscribe = () => {};
    const registered = new Promise<void>((resolve) => {
      unsubscribe = onRegistered(key, resolve);
    });
    try {
      await Promise.race([registered, stopWaiting(key)]);
    } finally {
      unsubscribe();
    }
    return find(key);
  };

  return {
    find,
    waitFor,
    onRegistered,
    displayName: (key) =>
      getWalletProviderDataByKey({ walletProviderKey: key }, client).metadata.displayName,
    release: async (key) => {
      const accounts = getWalletAccounts(client).filter((a) => a.walletProviderKey === key);
      await Promise.all(
        accounts.map((walletAccount) => removeWalletAccount({ walletAccount }, client)),
      );
    },
    toNetworkData,
  };
}

function startDynamic(): Dynamic {
  const client = createDynamicClient({
    environmentId: DYNAMIC_ENVIRONMENT_ID,
    metadata: { name: "Zama Confidential Token Quickstart" },
    // The network table is the only set of networks Dynamic knows, whatever its dashboard lists.
    transformers: {
      networksData: () => NETWORK_KEYS.map((key) => toNetworkData(networks[key].chain)),
    },
    // No telemetry to Dynamic's own log endpoint.
    instrumentation: { enabled: false },
  });

  addEIP6963Extension(client);
  // In-app wallet browsers inject `window.ethereum` without announcing it.
  addEvmWindowInjectedExtension(client);

  const initialized = waitForClientInitialized(client).then(
    () => true,
    (error: unknown) => {
      console.error("Dynamic did not initialize", error);
      // Drop the failed client so the dialog's Retry starts a fresh one.
      dynamic = undefined;
      return false;
    },
  );
  // Restoring a WalletConnect session needs the project settings initialization loads.
  const walletConnectRestored = initialized.then(async (ok) => {
    if (!ok) return;
    try {
      await addWalletConnectEvmExtension(client);
    } catch (error) {
      console.error("Could not start WalletConnect", error);
    }
  });
  const browserWalletsAnnounced = new Promise((resolve) =>
    setTimeout(resolve, BROWSER_WALLET_WAIT_MS),
  );
  const stopWaiting = (key: string) =>
    key.split(":")[1] === "walletConnect" ? walletConnectRestored : browserWalletsAnnounced;

  return { client, wallets: createWallets(client, stopWaiting), initialized };
}

export function getDynamic(): Dynamic {
  if (typeof window === "undefined") throw new Error("The Dynamic client is browser-only");
  dynamic ??= startDynamic();
  return dynamic;
}

export interface CatalogueWallet {
  key: string;
  name: string;
  iconUrl?: string;
  installed: boolean;
}

const evmConnections = (option: WalletOption) =>
  option.connectionOptions.filter((connection) => connection.chain === "EVM");

/** Installed in this browser: announced or injected, not an SDK-backed popup. */
const isInstalled = (option: WalletOption) =>
  evmConnections(option).some((c) => c.type === "withWalletProvider" && c.source !== "sdk");

function toCatalogueWallet(option: WalletOption): CatalogueWallet {
  return {
    key: option.key,
    name: option.name,
    iconUrl: option.iconUrl,
    installed: isInstalled(option),
  };
}

/** Every EVM wallet in Dynamic's catalogue, installed ones first, WalletConnect always listed. */
export async function loadWallets(): Promise<CatalogueWallet[]> {
  const { client, initialized } = getDynamic();
  if (!(await initialized)) throw new Error("Dynamic did not initialize");
  const catalogue = await getWalletOptionsCatalogue({ includeMobileOptions: true }, client);
  const offered = catalogue
    .filter((option) => evmConnections(option).length > 0 || option.key === WALLETCONNECT_KEY)
    .map(toCatalogueWallet);
  const hasWalletConnect = offered.some((wallet) => wallet.key === WALLETCONNECT_KEY);
  return [
    ...offered.filter((wallet) => wallet.installed),
    ...offered.filter((wallet) => !wallet.installed),
    ...(hasWalletConnect
      ? []
      : [{ key: WALLETCONNECT_KEY, name: "WalletConnect", installed: false }]),
  ];
}

async function pairOverWalletConnect(onPairingUri: (uri: string) => void): Promise<WalletAccount> {
  const { uri, approval } = await connectWithWalletConnectEvm(
    { addToDynamicWalletAccounts: true },
    getDynamic().client,
  );
  onPairingUri(uri);
  const [first] = (await approval()).walletAccounts;
  if (!first) throw new Error("WalletConnect approved a session with no account");
  return first;
}

function authorize(walletKey: string, onPairingUri: (uri: string) => void) {
  if (walletKey === WALLETCONNECT_KEY) return pairOverWalletConnect(onPairingUri);
  return connectWalletOption(
    { walletKey, chain: "EVM", onConnectionUri: ({ uri }) => onPairingUri(uri) },
    getDynamic().client,
  );
}

export interface ConnectOptions {
  /** Receives a WalletConnect URI for the user to copy into the wallet or open as a link. */
  onPairingUri: (uri: string) => void;
  /** A wallet authorized after the abort is released; the call rejects with the abort reason. */
  signal: AbortSignal;
}

export async function connectWallet(
  config: Config,
  walletKey: string,
  { onPairingUri, signal }: ConnectOptions,
): Promise<void> {
  const walletAccount = await authorize(walletKey, onPairingUri);
  const { client, wallets } = getDynamic();
  if (signal.aborted) {
    // The user left before the wallet answered, e.g. a phone approved a stale pairing.
    await removeWalletAccount({ walletAccount }, client);
    signal.throwIfAborted();
  }
  try {
    await connectDynamicWallet(config, wallets, walletAccount.walletProviderKey);
  } catch (error) {
    await removeWalletAccount({ walletAccount }, client);
    throw error;
  }
}
