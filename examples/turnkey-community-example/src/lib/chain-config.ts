import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";
import { sepolia, mainnet } from "viem/chains";
import type { Chain } from "viem";

// Anything that is not explicitly "mainnet" is treated as testnet (Sepolia by default).
const isMainnet = process.env.NEXT_PUBLIC_CHAIN === "mainnet";

export const zamaConfig = isMainnet ? MainnetConfig : SepoliaConfig;
export const viemChain: Chain = isMainnet ? mainnet : sepolia;
export const explorerUrl = isMainnet ? "https://etherscan.io" : "https://sepolia.etherscan.io";

// True for every network that is not Ethereum mainnet.
// Used to gate testnet-only UI (e.g. permissionless token minting).
export const isTestnet = !isMainnet;
