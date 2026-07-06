#!/usr/bin/env node
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as viemSepolia } from "viem/chains";
import { Redis } from "ioredis";
import { sepolia } from "@zama-fhe/sdk/chains";
import { parseConfig } from "./config.js";
import { createSdk } from "./sdk.js";
import { createLogger } from "./logging/logger.js";
import { createInMemoryStore, createRedisStore, type KeyValueStore } from "./storage/kv-store.js";
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

  // One Redis connection, one hash per store, if --redisUrl is set; otherwise
  // every store keeps today's default (in-memory, lost on restart). Not a
  // partial option — all four stores persist together or none do, so a
  // restart's data loss (or lack of it) is predictable everywhere.
  const redis = config.redisUrl ? new Redis(config.redisUrl) : undefined;
  if (redis) {
    logger.info(`Persisting to Redis at ${config.redisUrl}`);
  } else {
    logger.warn(
      "No --redisUrl configured: all state is in-memory and lost on restart " +
        "(delegations get rediscovered from --fromBlock; decrypted balances/transfers do not).",
    );
  }
  const store = (name: string): KeyValueStore =>
    redis ? createRedisStore(redis, name) : createInMemoryStore();

  const delegationStore = new DelegationStore(store("delegations"));
  const balanceStore = new BalanceStore(store("balances"));
  const transferStore = new TransferStore(store("transfers"));
  const decryptCache = new DecryptCache({ store: store("decrypt-cache"), sdk, logger });
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
    server.close(() => {
      redis?.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("Fatal:", error);
  process.exitCode = 1;
});
