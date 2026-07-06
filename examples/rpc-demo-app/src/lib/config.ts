// ─── Network + backend configuration ──────────────────────────────────────────
//
// This app deliberately never imports `@zama-fhe/sdk` or `@zama-fhe/react-sdk` —
// it only talks to two plain HTTP endpoints:
//   - ZAMA_RPC_URL: the zama-json-rpc wrapper (examples/zama-json-rpc). This app's
//     wagmi `transports` config points here, and — this is the part that matters —
//     so should your wallet's own Sepolia RPC setting (see README.md). Everything
//     this page sends looks like ordinary Ethereum JSON-RPC because it is.
//   - INDEXER_URL: confidential-indexer's REST API. Plain `fetch()`, no SDK.

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";

// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* variables with an empty
// string at build time, not undefined. ?? treats "" as valid and would use it.
export const ZAMA_RPC_URL = process.env.NEXT_PUBLIC_ZAMA_RPC_URL || "http://127.0.0.1:8545";
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || "http://127.0.0.1:8787";

// Same real Sepolia deployment used throughout the zama-json-rpc /
// confidential-indexer verification work: cUSDC and its ConfidentialVault
// (examples/react-wagmi's SDK-244 deposit demo).
export const CUSDC_ADDRESS = (process.env.NEXT_PUBLIC_CUSDC_ADDRESS ||
  "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639") as `0x${string}`;
export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
  "0xb13720bec167A576D715F5aA7C7d68b3dB0A4Ad7") as `0x${string}`;
export const CUSDC_DECIMALS = 6;
export const CUSDC_SYMBOL = "cUSDC";
