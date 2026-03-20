/**
 * Global setup for node playwright tests.
 *
 * Swaps the real WASM node worker with our mock so RelayerNode
 * works against the local anvil without @zama-fhe/relayer-sdk.
 */
import { copyFileSync, existsSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Find the built SDK's node worker location
const sdkNodeEntry = require.resolve("@zama-fhe/sdk/node");
const sdkNodeDir = dirname(sdkNodeEntry);
const workerPath = resolve(sdkNodeDir, "relayer-sdk.node-worker.js");
const backupPath = resolve(sdkNodeDir, "relayer-sdk.node-worker.js.bak");
const mockPath = resolve(import.meta.dirname, "relayer-sdk.node-worker.mock.mjs");

export default async function globalSetup() {
  // Back up the original worker and replace with mock
  if (existsSync(workerPath)) {
    renameSync(workerPath, backupPath);
  }
  copyFileSync(mockPath, workerPath);

  // Return teardown function to restore the original
  return async () => {
    if (existsSync(backupPath)) {
      renameSync(backupPath, workerPath);
    }
  };
}
