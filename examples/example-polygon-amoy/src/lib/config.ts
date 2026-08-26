// ─── Polygon Amoy network configuration ──────────────────────────────────────
// Polygon Amoy (chain 80002) runs the full Zama Protocol FHE stack behind the
// shared public testnet relayer. Edit these values to target a different network.

export const AMOY_CHAIN_ID = 80002;
export const AMOY_CHAIN_ID_HEX = `0x${AMOY_CHAIN_ID.toString(16)}`; // "0x13882"
export const AMOY_EXPLORER_URL = "https://amoy.polygonscan.com";
const AMOY_RPC_DEFAULT = "https://polygon-amoy-bor-rpc.publicnode.com";
// Use || not ??, because Next.js replaces unset NEXT_PUBLIC_* variables with an empty string
// at build time, not undefined. The nullish coalescing operator (??) treats "" as a
// valid value and would use it as the RPC URL, causing a runtime error.
export const AMOY_RPC_URL = process.env.NEXT_PUBLIC_AMOY_RPC_URL || AMOY_RPC_DEFAULT;
