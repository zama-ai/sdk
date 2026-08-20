import { sepolia as sepoliaConfig, mainnet as mainnetConfig } from "@zama-fhe/sdk";
import { sepolia, mainnet } from "viem/chains";
import type { Chain } from "viem";

const isMainnet = process.env.NEXT_PUBLIC_CHAIN === "mainnet";

export const zamaConfig = isMainnet ? mainnetConfig : sepoliaConfig;
export const viemChain: Chain = isMainnet ? mainnet : sepolia;
export const explorerUrl = isMainnet
  ? "https://eth.blockscout.com"
  : "https://eth-sepolia.blockscout.com";

// True for every network that is not Ethereum mainnet.
// Used to gate testnet-only UI (e.g. permissionless token minting).
export const isTestnet = !isMainnet;

// Falls back to the public node bundled in the Zama SDK config for the selected chain.
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? zamaConfig.network;
