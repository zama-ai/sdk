// ─── Hoodi network configuration ─────────────────────────────────────────────

export const HOODI_CHAIN_ID = 560048;
export const HOODI_CHAIN_ID_HEX = `0x${HOODI_CHAIN_ID.toString(16)}`;
export const HOODI_EXPLORER_URL = "https://hoodi.etherscan.io";
const HOODI_RPC_DEFAULT = "https://rpc.hoodi.ethpandaops.io";
export const HOODI_RPC_URL = process.env.NEXT_PUBLIC_HOODI_RPC_URL || HOODI_RPC_DEFAULT;
