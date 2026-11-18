// ─── Upstream relayers (server-side only) ──────────────────────────────────────
// Where the proxy forwards relayer traffic, per relayer-backed network. URLs and API keys
// live in server env vars and never reach the browser; the API routes are the only readers.
import { envList } from "@/lib/env";
import { ENVIRONMENTS, type Environment, isCustomized, networkId } from "@/lib/environment";
import { NETWORK_KEYS, networks, type NetworkKey } from "@/lib/networks";

// The public testnet relayer serves every testnet and needs no API key. Its `keyurl` names
// this bucket for the FHE public key and CRS.
const TESTNET_RELAYER_URL = "https://relayer.testnet.zama.org";
const TESTNET_KEY_STORAGE = "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com";

// Bare relayer hosts, no /v2 suffix, per environment.
const upstreams: Record<
  Environment,
  Partial<Record<NetworkKey, { url?: string; apiKey?: string }>>
> = {
  default: {
    sepolia: {
      url: process.env.SEPOLIA_RELAYER_URL || TESTNET_RELAYER_URL,
      apiKey: process.env.SEPOLIA_RELAYER_API_KEY,
    },
    // Mainnets have no default. Unset means the network is hidden, never a fallback.
    mainnet: { url: process.env.MAINNET_RELAYER_URL, apiKey: process.env.MAINNET_RELAYER_API_KEY },
    polygon: { url: process.env.POLYGON_RELAYER_URL, apiKey: process.env.POLYGON_RELAYER_API_KEY },
  },
  // Only the networks the custom environment changes. No default: unset hides the network.
  custom: {
    sepolia: {
      url: process.env.SEPOLIA_CUSTOM_RELAYER_URL,
      apiKey: process.env.SEPOLIA_CUSTOM_RELAYER_API_KEY,
    },
  },
};

// Optional allowlist of table keys for a deployment that offers a subset (a hosted instance:
// `mainnet,sepolia`). Unset means every row the server can serve. An unknown key is a typo
// that would silently hide a network, so it fails at startup: the instrumentation hook loads
// this module at boot, where the API routes would only load it on the first request.
const allowlist = envList("ENABLED_NETWORKS");
const unknownKeys = allowlist.filter((key) => !(NETWORK_KEYS as string[]).includes(key));
if (unknownKeys.length > 0) {
  throw new Error(
    `ENABLED_NETWORKS has unknown keys: ${unknownKeys.join(", ")}. Known: ${NETWORK_KEYS.join(", ")}.`,
  );
}

function listed(key: NetworkKey): boolean {
  return allowlist.length === 0 || allowlist.includes(key);
}

// The SDK downloads the FHE key on the page thread, so these origins go into the page CSP's
// connect-src verbatim. Each has to be an origin: `*` would open connect-src to everything
// and a `;` would append a directive.
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;
const extraOrigins = envList("CSP_CONNECT_SRC");
const notOrigins = extraOrigins.filter((entry) => !ORIGIN.test(entry));
if (notOrigins.length > 0) {
  throw new Error(
    `CSP_CONNECT_SRC has entries that are not origins: ${notOrigins.join(", ")}. Expected http(s)://host[:port], no path or trailing slash.`,
  );
}

export const keyStorageOrigins: readonly string[] = [TESTNET_KEY_STORAGE, ...extraOrigins];

export interface Upstream {
  url: string;
  apiKey?: string;
}

function upstream(key: NetworkKey, env: Environment): Upstream | undefined {
  const entry = listed(key) ? upstreams[env][key] : undefined;
  return entry?.url ? { url: entry.url, apiKey: entry.apiKey } : undefined;
}

/**
 * The upstream relayer for a network id (the proxy route segment, see `networkId`), or
 * undefined when none is configured (fail closed).
 */
export function upstreamFor(id: string): Upstream | undefined {
  for (const key of NETWORK_KEYS) {
    for (const env of ENVIRONMENTS) {
      if (networkId(key, env) === id) return upstream(key, env);
    }
  }
  return undefined;
}

/** Networks the picker may list: cleartext rows always, relayer rows only when configured. */
export function enabledNetworks(): NetworkKey[] {
  return NETWORK_KEYS.filter(
    (key) =>
      listed(key) &&
      (networks[key].transport === "cleartext" || upstream(key, "default") !== undefined),
  );
}

/** Networks the picker also lists in the custom environment: those it changes and serves. */
export function customEnvironmentNetworks(): NetworkKey[] {
  return NETWORK_KEYS.filter((key) => isCustomized(key) && upstream(key, "custom") !== undefined);
}
