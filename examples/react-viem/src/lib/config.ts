// ─── Sepolia network configuration ────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`; // "0xaa36a7"
const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* with "" (empty string) at build time,
// not undefined. "" is not nullish, so ?? would use the empty string as the URL.
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_RPC_DEFAULT;

// Extends viem's stock Sepolia definition instead of redefining it, so multicall3, the
// ENS resolver, and the testnet flag stay inherited (and keep up with viem). Only two
// fields are overridden: the block explorer (Blockscout renders confidential tokens and
// transfers better than Etherscan) and the RPC, so both the app and the wallet's
// "add network" prompt use the endpoint configured via NEXT_PUBLIC_SEPOLIA_RPC_URL.
export const sepoliaChain = defineChain({
  ...sepolia,
  rpcUrls: { default: { http: [SEPOLIA_RPC_URL] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth-sepolia.blockscout.com",
      apiUrl: "https://eth-sepolia.blockscout.com/api",
    },
  },
});

export const SEPOLIA_EXPLORER_URL = sepoliaChain.blockExplorers.default.url;
