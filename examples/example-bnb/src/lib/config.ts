// ─── BNB Smart Chain Testnet configuration ────────────────────────────────────
// BNB Smart Chain Testnet (chain 97, Chapel) — cleartext FHEVM stack deployed for the Zama SDK demo.
// Development/integration setup, not intended for production use.
// Edit these values to target a different network.

export const BSC_TESTNET_CHAIN_ID = 97;
export const BSC_TESTNET_CHAIN_ID_HEX = `0x${BSC_TESTNET_CHAIN_ID.toString(16)}`; // "0x61"
export const BSC_TESTNET_EXPLORER_URL = "https://testnet.bscscan.com";
const BSC_TESTNET_RPC_DEFAULT = "https://bsc-testnet-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* with "" (empty string) at build time,
// not undefined. "" is not nullish, so ?? would use the empty string as the URL.
export const BSC_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || BSC_TESTNET_RPC_DEFAULT;
