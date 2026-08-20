// ─── Hoodi network configuration ─────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";

export const HOODI_CHAIN_ID = 560048;
export const HOODI_CHAIN_ID_HEX = `0x${HOODI_CHAIN_ID.toString(16)}`;
export const HOODI_EXPLORER_URL = "https://eth-hoodi.blockscout.com";
const HOODI_RPC_DEFAULT = "https://rpc.hoodi.ethpandaops.io";
export const HOODI_RPC_URL = process.env.NEXT_PUBLIC_HOODI_RPC_URL || HOODI_RPC_DEFAULT;

// Custom chain definition (rather than importing wagmi/viem's stock `hoodi`) so the
// wallet's "add network" prompt points at Blockscout instead of the baked-in Etherscan entry.
export const hoodi = defineChain({
  id: HOODI_CHAIN_ID,
  name: "Hoodi",
  nativeCurrency: { name: "Hoodi Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [HOODI_RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: HOODI_EXPLORER_URL } },
});
