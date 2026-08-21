// ─── Sepolia network configuration ────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";
import { sepolia as viemSepolia } from "viem/chains";

export const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* variables with an empty string
// at build time, not undefined. The nullish coalescing operator (??) treats "" as a
// valid value and would use it as the RPC URL, causing a runtime error.
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_RPC_DEFAULT;

// Extends viem's stock Sepolia definition instead of redefining it. The RPC override
// also feeds the wallet's "add network" prompt.
export const sepolia = defineChain({
  ...viemSepolia,
  rpcUrls: { default: { http: [SEPOLIA_RPC_URL] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth-sepolia.blockscout.com",
      apiUrl: "https://eth-sepolia.blockscout.com/api",
    },
  },
});

export const SEPOLIA_EXPLORER_URL = sepolia.blockExplorers.default.url;

// ─── ConfidentialVault example (confidentialTransferAndCall demo) ───────────────
// A minimal confidential escrow deployed on Sepolia. A deposit moves confidential
// tokens into the vault in a single `confidentialTransferAndCall`; the `data`
// payload names the beneficiary to credit. Bound to one confidential token
// (cUSDC) at deployment — the vault cards only render when that token is selected.
// See contracts/src/ConfidentialVault.sol and contracts/script/DeployVault.s.sol.
export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
  "0xb13720bec167A576D715F5aA7C7d68b3dB0A4Ad7") as `0x${string}`;
export const VAULT_CONFIDENTIAL_TOKEN = (process.env.NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN ||
  "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639") as `0x${string}`;
