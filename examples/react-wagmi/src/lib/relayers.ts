// ─── Upstream relayers (server-side only) ──────────────────────────────────────
// Where the proxy forwards relayer traffic, per relayer-backed network. URLs and API keys
// live in server env vars and never reach the browser; the API routes are the only readers.
import { NETWORK_KEYS, networks, type NetworkKey } from "@/lib/networks";

// The public testnet relayer serves every testnet and needs no API key.
const TESTNET_RELAYER_URL = "https://relayer.testnet.zama.org";

// Bare relayer hosts, no /v2 suffix.
const upstreams: Partial<Record<NetworkKey, { url?: string; apiKey?: string }>> = {
  sepolia: {
    url: process.env.SEPOLIA_RELAYER_URL || TESTNET_RELAYER_URL,
    apiKey: process.env.SEPOLIA_RELAYER_API_KEY,
  },
  "polygon-amoy": {
    url: process.env.POLYGON_AMOY_RELAYER_URL || TESTNET_RELAYER_URL,
    apiKey: process.env.POLYGON_AMOY_RELAYER_API_KEY,
  },
  // Mainnets have no default. Unset means the network is hidden, never a fallback.
  mainnet: { url: process.env.MAINNET_RELAYER_URL, apiKey: process.env.MAINNET_RELAYER_API_KEY },
  polygon: { url: process.env.POLYGON_RELAYER_URL, apiKey: process.env.POLYGON_RELAYER_API_KEY },
};

export interface Upstream {
  url: string;
  apiKey?: string;
}

/** The upstream relayer for a network, or undefined when none is configured (fail closed). */
export function upstreamFor(network: string): Upstream | undefined {
  const entry = upstreams[network as NetworkKey];
  return entry?.url ? { url: entry.url, apiKey: entry.apiKey } : undefined;
}

/** Networks the picker may list: cleartext rows always, relayer rows only when configured. */
export function enabledNetworks(): NetworkKey[] {
  return NETWORK_KEYS.filter(
    (key) => networks[key].transport === "cleartext" || upstreamFor(key) !== undefined,
  );
}
