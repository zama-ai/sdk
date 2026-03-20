/**
 * Global setup for node playwright tests.
 *
 * Swaps the real WASM node worker with the mock-fhevm worker that uses
 * @fhevm/mock-utils MockFhevmInstance for proper handle generation,
 * encryption, and decryption against the local anvil.
 */
import { copyFileSync, existsSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const sdkNodeEntry = require.resolve("@zama-fhe/sdk/node");
const sdkNodeDir = dirname(sdkNodeEntry);
const workerPath = resolve(sdkNodeDir, "relayer-sdk.node-worker.js");
const backupPath = resolve(sdkNodeDir, "relayer-sdk.node-worker.js.bak");
const mockPath = resolve(import.meta.dirname, "mock-fhevm-node-worker.mjs");

export default async function globalSetup() {
  if (existsSync(workerPath)) {
    renameSync(workerPath, backupPath);
  }
  copyFileSync(mockPath, workerPath);

  return async () => {
    if (existsSync(backupPath)) {
      renameSync(backupPath, workerPath);
    }
  };
}
