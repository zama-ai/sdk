#!/usr/bin/env node
import { sepolia } from "@zama-fhe/sdk/chains";
import { parseConfig } from "./config.js";
import { createSdk } from "./sdk.js";
import { ConfidentialOperationRegistry } from "./registry/index.js";
import { TokenValidityCache } from "./registry/token-validity-cache.js";
import { confidentialTransferOperation } from "./registry/operations/confidential-transfer.js";
import { confidentialTransferFromOperation } from "./registry/operations/confidential-transfer-from.js";
import { confidentialTransferAndCallOperation } from "./registry/operations/confidential-transfer-and-call.js";
import { confidentialTransferFromAndCallOperation } from "./registry/operations/confidential-transfer-from-and-call.js";
import { unwrapOperation } from "./registry/operations/unwrap.js";
import { finalizeUnwrapOperation } from "./registry/operations/finalize-unwrap.js";
import { createLogger } from "./logging/logger.js";
import { AuditBuffer } from "./logging/audit-buffer.js";
import { createUpstreamForwarder } from "./rpc/passthrough.js";
import { buildZamaHandlers } from "./zama/introspection.js";
import { createHttpServer } from "./server.js";

async function main() {
  const config = parseConfig(process.argv.slice(2));
  const auditBuffer = new AuditBuffer();
  const logger = createLogger({ quiet: config.quiet, verbose: config.verbose, auditBuffer });

  if (!config.apiKey) {
    logger.warn(
      "No --apiKey configured: this server is unauthenticated. Anyone who can reach it can " +
        "trigger real relayer encrypt() calls and probe which addresses are confidential " +
        "tokens. Fine for local exploration, not for anything beyond that — see WALKTHROUGH.md.",
    );
  }

  const sdk = createSdk(config);
  const registry = new ConfidentialOperationRegistry([
    confidentialTransferOperation({ chainId: config.chainId }),
    confidentialTransferFromOperation({ chainId: config.chainId }),
    confidentialTransferAndCallOperation({ chainId: config.chainId }),
    confidentialTransferFromAndCallOperation({ chainId: config.chainId }),
    unwrapOperation({ chainId: config.chainId }),
    finalizeUnwrapOperation({ chainId: config.chainId }),
  ]);
  const tokenValidityCache = new TokenValidityCache({
    positiveTtlMs: config.tokenValidityTtlSeconds * 1000,
  });
  const zamaHandlers = buildZamaHandlers({ registry, chain: sepolia });
  const forwardToUpstream = createUpstreamForwarder(config.rpcUrl);

  const server = createHttpServer({
    routerDeps: {
      sdk,
      registry,
      tokenValidityCache,
      chainId: config.chainId,
      logger,
      forwardToUpstream,
      zamaHandlers,
    },
    httpPath: config.httpPath,
    apiKey: config.apiKey,
    logger,
    auditBuffer,
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
