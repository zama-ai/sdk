import { Command } from "commander";

export interface AppConfig {
  rpcUrl: string;
  chainId: number;
  host: string;
  port: number;
  httpPath: string;
  relayerApiKey: string | undefined;
  /** Shared-secret bearer token gating this server's own JSON-RPC surface — separate from `relayerApiKey`. */
  apiKey: string | undefined;
  /**
   * TTL (seconds) for this wrapper's own cache of `isConfidentialTokenValid()`
   * results — NOT an SDK setting. That method has no caching in the SDK
   * itself (verified against source — unlike its sibling
   * `getConfidentialToken`), so this wrapper caches it locally; see
   * `registry/token-validity-cache.ts`.
   */
  tokenValidityTtlSeconds: number;
  verbose: boolean;
  quiet: boolean;
}

const DEFAULTS = {
  host: "127.0.0.1",
  port: 8545,
  httpPath: "/",
  chainId: 11155111,
  tokenValidityTtlSeconds: 86_400,
} as const;

function env(name: string): string | undefined {
  return process.env[name];
}

export function parseConfig(argv: string[]): AppConfig {
  const program = new Command();

  program
    .name("zama-json-rpc")
    .description(
      "Local JSON-RPC server that forwards standard Ethereum methods to an upstream RPC " +
        "and transparently rewrites plaintext confidential-token calls into real ERC-7984 " +
        "calls, encrypting arguments via the Zama SDK before forwarding. Any token confirmed " +
        "valid via Zama's on-chain wrappers registry is supported — no per-token config needed.",
    )
    .option(
      "--http",
      "Run an HTTP server (the only transport this POC supports — accepted for " +
        "command-line parity with fireblocks-json-rpc, which also supports IPC)",
    )
    .option("--rpcUrl <url>", "Upstream Ethereum RPC URL", env("ZAMA_RPC_URL"))
    .option("--chainId <id>", "Chain ID", env("ZAMA_CHAIN_ID"))
    .option("--host <host>", "HTTP server host", env("ZAMA_HOST"))
    .option("--port <port>", "HTTP server port", env("ZAMA_PORT"))
    .option("--httpPath <path>", "HTTP JSON-RPC endpoint path", env("ZAMA_HTTP_PATH"))
    .option(
      "--relayerApiKey <key>",
      "Zama relayer API key (optional on testnet)",
      env("ZAMA_RELAYER_API_KEY"),
    )
    .option(
      "--apiKey <key>",
      "Shared-secret bearer token required to call this server (separate from --relayerApiKey)",
      env("ZAMA_API_KEY"),
    )
    .option(
      "--tokenValidityTtlSeconds <seconds>",
      "TTL for this wrapper's own confidential-token validity cache (not an SDK setting)",
      env("ZAMA_TOKEN_VALIDITY_TTL_SECONDS"),
    )
    .option("-v, --verbose", "Print requests/responses for debugging", Boolean(env("ZAMA_VERBOSE")))
    .option("-q, --quiet", "Only print fatal errors", Boolean(env("ZAMA_QUIET")))
    .allowExcessArguments(true)
    .allowUnknownOption(false);

  program.parse(argv, { from: "user" });
  const opts = program.opts();

  if (!opts.rpcUrl) {
    throw new Error("Missing --rpcUrl (or ZAMA_RPC_URL): upstream Ethereum RPC URL is required");
  }

  return {
    rpcUrl: opts.rpcUrl,
    chainId: opts.chainId ? Number(opts.chainId) : DEFAULTS.chainId,
    host: opts.host ?? DEFAULTS.host,
    port: opts.port ? Number(opts.port) : DEFAULTS.port,
    httpPath: opts.httpPath ?? DEFAULTS.httpPath,
    relayerApiKey: opts.relayerApiKey,
    apiKey: opts.apiKey,
    tokenValidityTtlSeconds: opts.tokenValidityTtlSeconds
      ? Number(opts.tokenValidityTtlSeconds)
      : DEFAULTS.tokenValidityTtlSeconds,
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
  };
}
