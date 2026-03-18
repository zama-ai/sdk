// ─── Hoodi network configuration ─────────────────────────────────────────────
// Edit these values to target a different network.

export const HOODI_CHAIN_ID = 560048;
export const HOODI_CHAIN_ID_HEX = "0x88bb0";
export const HOODI_EXPLORER_URL = "https://hoodi.etherscan.io";
const HOODI_RPC_FALLBACK = "https://rpc.hoodi.ethpandaops.io";
export const HOODI_RPC_URL = process.env.NEXT_PUBLIC_HOODI_RPC_URL || HOODI_RPC_FALLBACK;
