// ─── BNB Smart Chain Testnet configuration ────────────────────────────────────
// BSC Testnet (chain 97) — cleartext fhEVM stack deployed
// for the Zama SDK BNB demo. Edit these values to target a different network.

export const BNB_CHAIN_ID = 97;
export const BNB_CHAIN_ID_HEX = `0x${BNB_CHAIN_ID.toString(16)}`; // "0x61"
export const BNB_EXPLORER_URL = "https://testnet.bscscan.com";
const BNB_RPC_DEFAULT = "https://bsc-testnet-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* with "" (empty string) at build time,
// not undefined. "" is not nullish, so ?? would use the empty string as the URL.
export const BNB_RPC_URL = process.env.NEXT_PUBLIC_BNB_RPC_URL || BNB_RPC_DEFAULT;
