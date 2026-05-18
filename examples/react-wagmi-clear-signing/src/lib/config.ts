// ─── Sepolia network configuration ────────────────────────────────────────────
// Edit these values to target a different network.

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";
const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* variables with an empty string
// at build time, not undefined. The nullish coalescing operator (??) treats "" as a
// valid value and would use it as the RPC URL, causing a runtime error.
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_RPC_DEFAULT;
