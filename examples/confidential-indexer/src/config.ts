import { Command } from "commander";

export interface AppConfig {
  rpcUrl: string;
  chainId: number;
  host: string;
  port: number;
  /** Real signer for this service's operational (delegate) identity — see WALKTHROUGH.md ("custody"). */
  operationalPrivateKey: `0x${string}`;
  relayerApiKey: string | undefined;
  /** Shared-secret bearer token gating the query API — app-level auth, separate from on-chain ACL delegation. */
  apiKey: string | undefined;
  /** Block to start delegation-log scanning from. Defaults to a recent window, not genesis. */
  fromBlock: bigint;
  /** Redis connection URL for persistent stores. Undefined = in-memory (lost on restart). */
  redisUrl: string | undefined;
  pollIntervalMs: number;
  verbose: boolean;
  quiet: boolean;
}

const DEFAULTS = {
  host: "127.0.0.1",
  port: 8787,
  chainId: 11155111,
  pollIntervalMs: 60_000,
} as const;

function env(name: string): string | undefined {
  return process.env[name];
}

export function parseConfig(argv: string[]): AppConfig {
  const program = new Command();

  program
    .name("confidential-indexer")
    .description(
      "Read-side companion to zama-json-rpc: for token holders who have delegated decrypt " +
        "rights to this service's operational address, watches on-chain confidential transfers, " +
        "decrypts balances/amounts via the Zama relayer, and serves them through a query API — " +
        "never revealing anything outside what the on-chain ACL actually grants.",
    )
    .option("--rpcUrl <url>", "Upstream Ethereum RPC URL", env("INDEXER_RPC_URL"))
    .option("--chainId <id>", "Chain ID", env("INDEXER_CHAIN_ID"))
    .option("--host <host>", "HTTP server host", env("INDEXER_HOST"))
    .option("--port <port>", "HTTP server port", env("INDEXER_PORT"))
    .option(
      "--operationalPrivateKey <key>",
      "Private key for this service's delegate identity (real custody — see WALKTHROUGH.md)",
      env("INDEXER_OPERATIONAL_PRIVATE_KEY"),
    )
    .option(
      "--relayerApiKey <key>",
      "Zama relayer API key (optional on testnet)",
      env("INDEXER_RELAYER_API_KEY"),
    )
    .option(
      "--apiKey <key>",
      "Shared-secret bearer token required to query this service",
      env("INDEXER_API_KEY"),
    )
    .option(
      "--fromBlock <block>",
      "Block to start delegation-log scanning from (default: recent window, not genesis)",
      env("INDEXER_FROM_BLOCK"),
    )
    .option(
      "--pollIntervalMs <ms>",
      "Polling interval for new logs",
      env("INDEXER_POLL_INTERVAL_MS"),
    )
    .option(
      "--redisUrl <url>",
      "Redis connection URL for persistent stores (default: in-memory, lost on restart)",
      env("INDEXER_REDIS_URL"),
    )
    .option("-v, --verbose", "Verbose logging", Boolean(env("INDEXER_VERBOSE")))
    .option("-q, --quiet", "Only print fatal errors", Boolean(env("INDEXER_QUIET")))
    .allowExcessArguments(true)
    .allowUnknownOption(false);

  program.parse(argv, { from: "user" });
  const opts = program.opts();

  if (!opts.rpcUrl) {
    throw new Error("Missing --rpcUrl (or INDEXER_RPC_URL): upstream Ethereum RPC URL is required");
  }
  if (!opts.operationalPrivateKey) {
    throw new Error(
      "Missing --operationalPrivateKey (or INDEXER_OPERATIONAL_PRIVATE_KEY): this service needs a " +
        "real signer to receive/use ACL delegations — see WALKTHROUGH.md.",
    );
  }
  if (!opts.fromBlock) {
    throw new Error(
      "Missing --fromBlock (or INDEXER_FROM_BLOCK): scanning from genesis is impractical; pass a " +
        "recent block number to bound the initial delegation-log scan.",
    );
  }

  return {
    rpcUrl: opts.rpcUrl,
    chainId: opts.chainId ? Number(opts.chainId) : DEFAULTS.chainId,
    host: opts.host ?? DEFAULTS.host,
    port: opts.port ? Number(opts.port) : DEFAULTS.port,
    operationalPrivateKey: opts.operationalPrivateKey,
    relayerApiKey: opts.relayerApiKey,
    apiKey: opts.apiKey,
    fromBlock: BigInt(opts.fromBlock),
    redisUrl: opts.redisUrl,
    pollIntervalMs: opts.pollIntervalMs ? Number(opts.pollIntervalMs) : DEFAULTS.pollIntervalMs,
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
  };
}
