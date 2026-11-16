// ─── Upstream relayers (server-side only) ──────────────────────────────────────
// Where the proxy forwards relayer traffic, per relayer-backed network. URLs and API keys
// live in server env vars and never reach the browser; the API routes are the only readers.
import { envList } from "@/lib/env";
import { ENVIRONMENTS, type Environment, isCustomized, networkId } from "@/lib/environment";
import { NETWORK_KEYS, networks, type NetworkKey } from "@/lib/networks";

// The public testnet relayer serves every testnet and needs no API key.
const TESTNET_RELAYER_URL = "https://relayer.testnet.zama.org";

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
  // Only the networks the custom environment changes. No default: unset hides the custom option.
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

// Key storage origins go into the page CSP's connect-src verbatim. Each has to be an origin:
// `*` would open connect-src to everything and a `;` would append a directive.
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

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

// The SDK downloads the FHE public key and CRS on the page thread, from the URLs each relayer's
// `/v2/keyurl` returns, so their origins have to be in the page CSP's connect-src. The server
// asks the relayers itself, with their API keys, rather than making the deployer list them.
const KEY_ORIGINS_TTL_MS = 60 * 60 * 1000;
const KEY_ORIGINS_RETRY_MS = 60 * 1000;
const keyOriginsCache = new Map<string, { expires: number; origins: Promise<string[]> }>();

async function fetchKeyOrigins({ url, apiKey }: Upstream): Promise<string[]> {
  const response = await fetch(`${url}/v2/keyurl`, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  // Every key and CRS lists its download URLs under `urls`.
  const origins = new Set<string>();
  JSON.parse(await response.text(), (key, value: unknown) => {
    if (key === "urls" && Array.isArray(value)) {
      for (const entry of value) {
        const origin = typeof entry === "string" && URL.canParse(entry) && new URL(entry).origin;
        if (origin && ORIGIN.test(origin)) {
          origins.add(origin);
        }
      }
    }
    return value;
  });
  return [...origins];
}

function cachedKeyOrigins(upstream: Upstream): Promise<string[]> {
  const cached = keyOriginsCache.get(upstream.url);
  if (cached && cached.expires > Date.now()) {
    return cached.origins;
  }
  const entry = {
    expires: Date.now() + KEY_ORIGINS_TTL_MS,
    // A failure is kept for a minute only, so page loads do not each wait for a dead relayer.
    origins: fetchKeyOrigins(upstream).catch((error: unknown) => {
      entry.expires = Date.now() + KEY_ORIGINS_RETRY_MS;
      console.warn(
        `Could not read ${upstream.url}/v2/keyurl, so the page CSP blocks its FHE key and encryption fails until it answers:`,
        error,
      );
      return [];
    }),
  };
  keyOriginsCache.set(upstream.url, entry);
  return entry.origins;
}

/** Origins the page downloads FHE keys from, read from every enabled relayer in each environment. */
export async function keyStorageOrigins(): Promise<string[]> {
  const enabled = [
    ...enabledNetworks().map((key) => upstream(key, "default")),
    ...customEnvironmentNetworks().map((key) => upstream(key, "custom")),
  ];
  const relayers = new Map(
    enabled.flatMap((relayer) => (relayer ? [[relayer.url, relayer] as const] : [])),
  );
  const discovered = await Promise.all([...relayers.values()].map(cachedKeyOrigins));
  return [...new Set(discovered.flat())];
}
