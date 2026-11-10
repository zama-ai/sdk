// The Dynamic connector against a fake WalletConnect wallet: the suite runs the injected stack,
// and Dynamic's own WalletConnect flow needs its live API and a paired phone.
import { expect, test } from "@playwright/test";
import { mainnet, sepolia } from "viem/chains";
import { createConfig, http } from "wagmi";
import { getConnection, switchChain } from "wagmi/actions";
import {
  connectDynamicWallet,
  type DynamicWallet,
  type DynamicWallets,
} from "../src/lib/dynamicConnector";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const KEY = "safe:walletConnect:topic";

/** A WalletConnect wallet whose session approved `approved`, while Dynamic records Sepolia. */
function walletConnectWallet(approved: number[]) {
  let recordedChainId: number = sepolia.id;
  let closed = false;
  // Like Dynamic's provider, everything that reads the session throws once it is closed.
  const open = () => {
    if (closed) throw new Error("The WalletConnect session closed");
  };
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const events = {
    on: (name: string, listener: (payload?: unknown) => void) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
    },
    off: (name: string, listener: (payload?: unknown) => void) => {
      listeners.get(name)?.delete(listener);
    },
  };
  const wallet = {
    events,
    getConnectedAddresses: async () => {
      open();
      return { addresses: [ADDRESS] };
    },
    getActiveNetworkId: async () => {
      open();
      return { networkId: String(recordedChainId) };
    },
    switchActiveNetwork: async ({ networkId }: { networkId: string }) => {
      recordedChainId = Number(networkId);
    },
    request: async () => null,
    getSession: () => {
      open();
      return {
        namespaces: { eip155: { accounts: approved.map((id) => `eip155:${id}:${ADDRESS}`) } },
      };
    },
  } as unknown as DynamicWallet;
  const wallets: DynamicWallets = {
    find: () => wallet,
    waitFor: async () => wallet,
    onRegistered: () => () => {},
    displayName: () => "Safe",
    release: async () => {},
    toNetworkData: () => {
      throw new Error("not used");
    },
  };
  return {
    wallets,
    recordedChainId: () => recordedChainId,
    /** The wallet announces something, as Dynamic's provider events do. */
    emit: (name: string, payload?: unknown) => {
      for (const listener of listeners.get(name) ?? []) listener(payload);
    },
    closeSession: () => {
      closed = true;
    },
  };
}

const newConfig = () =>
  createConfig({
    chains: [sepolia, mainnet],
    transports: { [sepolia.id]: http(), [mainnet.id]: http() },
    storage: null,
  });

test("a WalletConnect wallet connects on a chain its session approved", async () => {
  const config = newConfig();
  const fake = walletConnectWallet([mainnet.id]);

  await connectDynamicWallet(config, fake.wallets, KEY);

  expect(getConnection(config).chainId).toBe(mainnet.id);
  // Dynamic sends requests on its recorded chain, so the record moved too.
  expect(fake.recordedChainId()).toBe(mainnet.id);
});

test("switching to a chain outside the session fails", async () => {
  const config = newConfig();
  const fake = walletConnectWallet([mainnet.id]);
  await connectDynamicWallet(config, fake.wallets, KEY);

  await expect(switchChain(config, { chainId: sepolia.id })).rejects.toThrow(
    /does not include Sepolia/,
  );
  expect(fake.recordedChainId()).toBe(mainnet.id);
});

test("a chain the wallet switches to moves Dynamic's record along with wagmi", async () => {
  const config = newConfig();
  const fake = walletConnectWallet([sepolia.id, mainnet.id]);
  await connectDynamicWallet(config, fake.wallets, KEY);
  expect(getConnection(config).chainId).toBe(sepolia.id);

  fake.emit("networkChanged", { networkId: String(mainnet.id) });

  await expect.poll(() => getConnection(config).chainId).toBe(mainnet.id);
  // Dynamic sends requests on its recorded chain, so it must not stay on Sepolia.
  expect(fake.recordedChainId()).toBe(mainnet.id);
});

test("a closed WalletConnect session reads as not authorized instead of throwing", async () => {
  const config = newConfig();
  const fake = walletConnectWallet([mainnet.id]);
  await connectDynamicWallet(config, fake.wallets, KEY);
  const connector = config.connectors.find(({ id }) => id === KEY);
  if (!connector) throw new Error("The connector was not registered");
  expect(await connector.isAuthorized()).toBe(true);

  fake.closeSession();
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    expect(await connector.isAuthorized()).toBe(false);
  } finally {
    console.warn = warn;
  }
  // wagmi's `reconnect` cannot say why it stayed disconnected, so the reason is logged.
  expect(warnings).toHaveLength(1);
});
