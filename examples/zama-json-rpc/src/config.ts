import { Command } from "commander";
import type { Address } from "viem";

export interface AppConfig {
  rpcUrl: string;
  chainId: number;
  host: string;
  port: number;
  httpPath: string;
  /** ERC-7984 confidential token wired into the v1 registry (see registry/operations). */
  confidentialTokenAddress: Address;
  relayerApiKey: string | undefined;
  verbose: boolean;
  quiet: boolean;
}

const DEFAULTS = {
  host: "127.0.0.1",
  port: 8545,
  httpPath: "/",
  chainId: 11155111,
  // cUSDC on Sepolia — same token used by examples/react-wagmi's vault demo.
  confidentialTokenAddress: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address,
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
        "calls, encrypting arguments via the Zama SDK before forwarding.",
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
      "--confidentialToken <address>",
      "ERC-7984 confidential token address wired for auto-rewrite",
      env("ZAMA_CONFIDENTIAL_TOKEN"),
    )
    .option(
      "--relayerApiKey <key>",
      "Zama relayer API key (optional on testnet)",
      env("ZAMA_RELAYER_API_KEY"),
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
    confidentialTokenAddress: (opts.confidentialToken ??
      DEFAULTS.confidentialTokenAddress) as Address,
    relayerApiKey: opts.relayerApiKey,
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
  };
}
