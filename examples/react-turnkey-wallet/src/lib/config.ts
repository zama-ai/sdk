import { sepolia as sepoliaConfig, mainnet as mainnetConfig } from "@zama-fhe/sdk";
import { sepolia as viemSepolia, mainnet as viemMainnet } from "viem/chains";
import { defineChain, type Chain } from "viem";

const isMainnet = process.env.NEXT_PUBLIC_CHAIN === "mainnet";

// Extend viem's stock definitions instead of redefining them, overriding only the
// block explorer.
const mainnet = defineChain({
  ...viemMainnet,
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth.blockscout.com",
      apiUrl: "https://eth.blockscout.com/api",
    },
  },
});
const sepolia = defineChain({
  ...viemSepolia,
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth-sepolia.blockscout.com",
      apiUrl: "https://eth-sepolia.blockscout.com/api",
    },
  },
});

const activeChain = isMainnet ? mainnet : sepolia;

export const zamaConfig = isMainnet ? mainnetConfig : sepoliaConfig;
export const viemChain: Chain = activeChain;
export const explorerUrl = activeChain.blockExplorers.default.url;

// True for every network that is not Ethereum mainnet.
// Used to gate testnet-only UI (e.g. permissionless token minting).
export const isTestnet = !isMainnet;

// Falls back to the public node bundled in the Zama SDK config for the selected chain.
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? zamaConfig.network;
