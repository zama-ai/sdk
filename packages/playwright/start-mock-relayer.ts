#!/usr/bin/env -S npx tsx
/**
 * Standalone entry point for the mock relayer server.
 * Started by playwright as a webServer (like start-anvil.sh).
 *
 * Usage: npx tsx start-mock-relayer.ts <port> <anvil-port>
 */
import { startMockRelayerServer } from "./fixtures/mock-relayer-server";

const port = Number(process.argv[2]);
const anvilPort = Number(process.argv[3]);

if (!port || !anvilPort) {
  console.error("Usage: start-mock-relayer.ts <port> <anvil-port>");
  process.exit(1);
}

await startMockRelayerServer(anvilPort, port);
console.log(`Mock relayer ready on port ${port}`);
