#!/usr/bin/env node
import { sepolia } from "@zama-fhe/sdk/chains";
import { parseConfig } from "./config.js";
import { createSdk } from "./sdk.js";
import { ConfidentialOperationRegistry } from "./registry/index.js";
import { confidentialTransferOperation } from "./registry/operations/confidential-transfer.js";
import { createLogger } from "./logging/logger.js";
import { createUpstreamForwarder } from "./rpc/passthrough.js";
import { buildZamaHandlers } from "./zama/introspection.js";
import { createHttpServer } from "./server.js";

async function main() {
  const config = parseConfig(process.argv.slice(2));
  const logger = createLogger({ quiet: config.quiet, verbose: config.verbose });

  const sdk = createSdk(config);
  const registry = new ConfidentialOperationRegistry([
    confidentialTransferOperation({
      chainId: config.chainId,
      tokenAddress: config.confidentialTokenAddress,
    }),
  ]);
  const zamaHandlers = buildZamaHandlers({ registry, chain: sepolia });
  const forwardToUpstream = createUpstreamForwarder(config.rpcUrl);

  const server = createHttpServer({
    routerDeps: { sdk, registry, chainId: config.chainId, logger, forwardToUpstream, zamaHandlers },
    httpPath: config.httpPath,
    logger,
  });

  if (config.host === "0.0.0.0") {
    logger.warn(
      "Listening on 0.0.0.0 exposes this Zama JSON-RPC service. Bind to 127.0.0.1 for local " +
        "development, or put access control in front of it before exposing this service.",
    );
  }

  server.listen(config.port, config.host, () => {
    logger.info(
      `Zama JSON-RPC server listening on http://${config.host}:${config.port}${config.httpPath}`,
    );
    logger.info(
      `Auto-rewriting confidential operations: ${registry
        .list()
        .map((operation) => operation.name)
        .join(", ")}`,
    );
  });

  const shutdown = () => {
    logger.info("Shutting down...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("Fatal:", error);
  process.exitCode = 1;
});
