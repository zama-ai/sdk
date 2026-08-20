// ─── Sepolia network configuration ────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`; // "0xaa36a7"
export const SEPOLIA_EXPLORER_URL = "https://eth-sepolia.blockscout.com";
const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* with "" (empty string) at build time,
// not undefined. "" is not nullish, so ?? would use the empty string as the URL.
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_RPC_DEFAULT;

// Custom chain definition (rather than importing viem's stock `sepolia`) so the
// wallet's "add network" prompt points at Blockscout instead of the baked-in Etherscan entry.
export const sepolia = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [SEPOLIA_RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: SEPOLIA_EXPLORER_URL } },
});
