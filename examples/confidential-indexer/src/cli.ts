#!/usr/bin/env node
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as viemSepolia } from "viem/chains";
import { sepolia } from "@zama-fhe/sdk/chains";
import { parseConfig } from "./config.js";
import { createSdk } from "./sdk.js";
import { createLogger } from "./logging/logger.js";
import { DelegationStore } from "./indexer/delegation-store.js";
import { BalanceStore } from "./indexer/balance-store.js";
import { TransferStore } from "./indexer/transfer-store.js";
import { DecryptCache } from "./indexer/decrypt-cache.js";
import {
  discoverDelegations,
  type DelegationDiscoveryState,
} from "./indexer/delegation-discovery.js";
import { refreshBalances } from "./indexer/balance-refresh.js";
import { trackTransfers, TransferScanState } from "./indexer/transfer-tracker.js";
import { createHttpServer } from "./server.js";

async function main() {
  const config = parseConfig(process.argv.slice(2));
  const logger = createLogger({ quiet: config.quiet, verbose: config.verbose });

  if (!config.apiKey) {
    logger.warn(
      "No --apiKey configured: the query API is unauthenticated. Anyone who can reach this " +
        "service can read anything it has decrypted. Fine for local exploration, not for anything " +
        "beyond that — see WALKTHROUGH.md.",
    );
  }

  const sdk = createSdk(config);
  const delegateAddress = privateKeyToAccount(config.operationalPrivateKey).address;
  const publicClient = createPublicClient({ chain: viemSepolia, transport: http(config.rpcUrl) });

  const delegationStore = new DelegationStore();
  const balanceStore = new BalanceStore();
  const transferStore = new TransferStore();
  const decryptCache = new DecryptCache({ sdk, logger });
  const discoveryState: DelegationDiscoveryState = { lastScannedBlock: config.fromBlock - 1n };
  const transferScanState = new TransferScanState();

  const server = createHttpServer({
    routerDeps: { delegationStore, balanceStore, transferStore, apiKey: config.apiKey },
    logger,
  });
  server.listen(config.port, config.host, () => {
    logger.info(`Confidential indexer listening on http://${config.host}:${config.port}`);
    logger.info(`Operational (delegate) address: ${delegateAddress}`);
  });

  let stopped = false;
  const tick = async () => {
    try {
      await discoverDelegations({
        publicClient,
        aclAddress: sepolia.aclContractAddress,
        delegateAddress,
        store: delegationStore,
        state: discoveryState,
        logger,
      });
      await refreshBalances({
        publicClient,
        store: delegationStore,
        balanceStore,
        decryptCache,
        logger,
      });
      await trackTransfers({
        publicClient,
        store: delegationStore,
        transferStore,
        decryptCache,
        scanState: transferScanState,
        fromBlockFloor: config.fromBlock,
        logger,
      });
    } catch (error) {
      logger.error(`Poll cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!stopped) setTimeout(() => void tick(), config.pollIntervalMs);
  };
  void tick();

  const shutdown = () => {
    stopped = true;
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
