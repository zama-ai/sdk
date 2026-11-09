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
  const wallet = {
    getConnectedAddresses: async () => ({ addresses: [ADDRESS] }),
    getActiveNetworkId: async () => ({ networkId: String(recordedChainId) }),
    switchActiveNetwork: async ({ networkId }: { networkId: string }) => {
      recordedChainId = Number(networkId);
    },
    request: async () => null,
    getSession: () => ({
      namespaces: { eip155: { accounts: approved.map((id) => `eip155:${id}:${ADDRESS}`) } },
    }),
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
  return { wallets, recordedChainId: () => recordedChainId };
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
