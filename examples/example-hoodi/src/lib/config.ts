// ─── Hoodi network configuration ─────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";
import { hoodi } from "viem/chains";

export const HOODI_CHAIN_ID = 560048;
export const HOODI_CHAIN_ID_HEX = `0x${HOODI_CHAIN_ID.toString(16)}`;
const HOODI_RPC_DEFAULT = "https://rpc.hoodi.ethpandaops.io";
export const HOODI_RPC_URL = process.env.NEXT_PUBLIC_HOODI_RPC_URL || HOODI_RPC_DEFAULT;

// Extends viem's stock Hoodi definition instead of redefining it, so multicall3 and the
// testnet flag stay inherited (and keep up with viem). Only two fields are overridden:
// the block explorer (Blockscout renders confidential tokens and transfers better than
// Etherscan) and the RPC, so both the app and the wallet's "add network" prompt use the
// endpoint configured via NEXT_PUBLIC_HOODI_RPC_URL.
export const hoodiChain = defineChain({
  ...hoodi,
  rpcUrls: { default: { http: [HOODI_RPC_URL] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth-hoodi.blockscout.com",
      apiUrl: "https://eth-hoodi.blockscout.com/api",
    },
  },
});

export const HOODI_EXPLORER_URL = hoodiChain.blockExplorers.default.url;
