// ─── InGen network configuration ──────────────────────────────────────────────
// T-Rex InGen private testnet (chain 364301, OP stack) — cleartext FHEVM
// deployment from SDK-184. Development/integration setup, not intended for production use.
// Edit these values to target a different network.
import { defineChain } from "viem";

export const INGEN_CHAIN_ID = 364301;
export const INGEN_CHAIN_ID_HEX = `0x${INGEN_CHAIN_ID.toString(16)}`; // "0x58f0d"
export const INGEN_EXPLORER_URL = "https://explorer.ingen.t-rex.network";
const INGEN_RPC_DEFAULT = "https://rpc.ingen.t-rex.network";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* with "" (empty string) at build time,
// not undefined. "" is not nullish, so ?? would use the empty string as the URL.
export const INGEN_RPC_URL = process.env.NEXT_PUBLIC_INGEN_RPC_URL || INGEN_RPC_DEFAULT;

export const ingen = defineChain({
  id: INGEN_CHAIN_ID,
  name: "T-Rex InGen",
  nativeCurrency: { name: "TREX", symbol: "TREX", decimals: 18 },
  rpcUrls: { default: { http: [INGEN_RPC_URL] } },
  blockExplorers: { default: { name: "InGen Explorer", url: INGEN_EXPLORER_URL } },
});
