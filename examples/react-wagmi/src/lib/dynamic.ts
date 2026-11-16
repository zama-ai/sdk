// Dynamic's headless SDK, connect-only (no sign-in, no embedded wallet): it supplies the wallet
// catalogue, the connect step and each wallet's EIP-1193 provider. wagmi owns the session.
// First, so jitless is on before the Dynamic SDK builds its schemas on import.
import "@/lib/zodJitless";
import {
  connectWalletOption,
  createDynamicClient,
  getWalletAccounts,
  getWalletOptionsCatalogue,
  getWalletProviderDataByKey,
  initializeClient,
  onEvent,
  removeWalletAccount,
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
const WALLETCONNECT_KEY = "walletconnect";

interface Dynamic {
  client: DynamicClient;
  initialized: Promise<void>;
  /** Settles when a wallet that has not registered yet is no longer expected to. */
  stopWaiting: (key: string) => Promise<unknown>;
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

function startDynamic(): Dynamic {
  const client = createDynamicClient({
    environmentId: DYNAMIC_ENVIRONMENT_ID,
    metadata: { name: "Zama Confidential Token Quickstart" },
    // Initialized below, so a failure reaches our handler instead of going unhandled.
    autoInitialize: false,
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

  const initialized = initializeClient(client);
  // Restoring a WalletConnect session needs the project settings initialization loads.
  const walletConnectRestored = initialized.then(
    () =>
      addWalletConnectEvmExtension(client).catch((error: unknown) => {
        console.error("Could not start WalletConnect", error);
      }),
    () => {},
  );
  const browserWalletsAnnounced = new Promise((resolve) =>
    setTimeout(resolve, BROWSER_WALLET_WAIT_MS),
  );

  const started: Dynamic = {
    client,
    initialized,
    // A WalletConnect provider key reads `<wallet>:walletConnect:<session topic>`.
    stopWaiting: (key) =>
      key.split(":")[1] === "walletConnect" ? walletConnectRestored : browserWalletsAnnounced,
  };
  initialized.catch((error: unknown) => {
    console.error("Dynamic did not initialize", error);
    // A client initializes once, so the dialog's Retry needs a fresh one.
    if (dynamic === started) dynamic = undefined;
  });
  return started;
}

function getDynamic(): Dynamic {
  if (typeof window === "undefined") throw new Error("The Dynamic client is browser-only");
  dynamic ??= startDynamic();
  return dynamic;
}

function findWallet(key: string): DynamicWallet | undefined {
  const provider = getWalletProviders(getDynamic().client).find(
    (candidate) => candidate.key === key,
  );
  if (!provider) return undefined;
  if (!isEvmWalletProvider(provider) || !provider.request) {
    throw new Error(`Dynamic provider "${key}" is not an EIP-1193 EVM provider`);
  }
  return provider;
}

function onRegistered(key: string, listener: () => void): () => void {
  return onEvent(
    {
      event: "walletProviderChanged",
      listener: (event) => {
        if (event.walletProviderKey === key) listener();
      },
    },
    getDynamic().client,
  );
}

/** Looks up the current client on every call, so a connector outlives a client that failed. */
export const dynamicWallets: DynamicWallets = {
  find: findWallet,
  onRegistered,
  waitFor: async (key) => {
    const present = findWallet(key);
    if (present) return present;
    let unsubscribe = () => {};
    const registered = new Promise<void>((resolve) => {
      unsubscribe = onRegistered(key, resolve);
    });
    try {
      await Promise.race([registered, getDynamic().stopWaiting(key)]);
    } finally {
      unsubscribe();
    }
    return findWallet(key);
  },
  displayName: (key) =>
    getWalletProviderDataByKey({ walletProviderKey: key }, getDynamic().client).metadata
      .displayName,
  release: async (key) => {
    const { client } = getDynamic();
    const accounts = getWalletAccounts(client).filter((a) => a.walletProviderKey === key);
    await Promise.all(
      accounts.map((walletAccount) => removeWalletAccount({ walletAccount }, client)),
    );
  },
  toNetworkData,
};

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
  await initialized;
  const catalogue = await getWalletOptionsCatalogue({ includeMobileOptions: true }, client);
  const offered = catalogue
    .filter((option) => evmConnections(option).length > 0 || option.key === WALLETCONNECT_KEY)
    .map(toCatalogueWallet)
    .sort((a, b) => Number(b.installed) - Number(a.installed));
  if (!offered.some((wallet) => wallet.key === WALLETCONNECT_KEY)) {
    offered.push({ key: WALLETCONNECT_KEY, name: "WalletConnect", installed: false });
  }
  return offered;
}

async function pairOverWalletConnect(
  client: DynamicClient,
  onPairingUri: (uri: string) => void,
): Promise<WalletAccount> {
  const { uri, approval } = await connectWithWalletConnectEvm(
    { addToDynamicWalletAccounts: true },
    client,
  );
  onPairingUri(uri);
  const [first] = (await approval()).walletAccounts;
  if (!first) throw new Error("WalletConnect approved a session with no account");
  return first;
}

function authorize(client: DynamicClient, walletKey: string, onPairingUri: (uri: string) => void) {
  if (walletKey === WALLETCONNECT_KEY) return pairOverWalletConnect(client, onPairingUri);
  return connectWalletOption(
    { walletKey, chain: "EVM", onConnectionUri: ({ uri }) => onPairingUri(uri) },
    client,
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
  const { client } = getDynamic();
  const walletAccount = await authorize(client, walletKey, onPairingUri);
  // Logged, not thrown, so a failed cleanup never hides the error the user should see.
  const release = () =>
    removeWalletAccount({ walletAccount }, client).catch((error: unknown) => {
      console.warn("Could not release the wallet", error);
    });
  if (signal.aborted) {
    // The user left before the wallet answered, e.g. a phone approved a stale pairing.
    await release();
    signal.throwIfAborted();
  }
  try {
    await connectDynamicWallet(config, dynamicWallets, walletAccount.walletProviderKey);
  } catch (error) {
    await release();
    throw error;
  }
}
