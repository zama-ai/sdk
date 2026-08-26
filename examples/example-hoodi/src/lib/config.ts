// ─── Hoodi network configuration ─────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";
import { hoodi as viemHoodi } from "viem/chains";

export const HOODI_CHAIN_ID = 560048;
export const HOODI_CHAIN_ID_HEX = `0x${HOODI_CHAIN_ID.toString(16)}`;
const HOODI_RPC_DEFAULT = "https://rpc.hoodi.ethpandaops.io";
export const HOODI_RPC_URL = process.env.NEXT_PUBLIC_HOODI_RPC_URL || HOODI_RPC_DEFAULT;

// Extends viem's stock Hoodi definition instead of redefining it. The RPC override
// also feeds the wallet's "add network" prompt.
export const hoodi = defineChain({
  ...viemHoodi,
  rpcUrls: { default: { http: [HOODI_RPC_URL] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth-hoodi.blockscout.com",
      apiUrl: "https://eth-hoodi.blockscout.com/api",
    },
  },
});

export const HOODI_EXPLORER_URL = hoodi.blockExplorers.default.url;
