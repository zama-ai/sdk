/**
 * Integration test for RelayerNode — proves the real WASM loads in
 * Node.js worker threads and can perform FHE operations.
 *
 * Requires: `pnpm build:sdk` (needs the built node worker JS file).
 * Does NOT need anvil or any network — WASM operations are local.
 */
import { describe, it, expect, afterEach } from "vitest";
import { RelayerNode } from "../relayer-node";

const HARDHAT_CHAIN_ID = 31337;

describe("RelayerNode integration", () => {
  let relayer: RelayerNode | null = null;

  afterEach(() => {
    relayer?.terminate();
    relayer = null;
  });

  it("loads WASM in a worker thread and generates a keypair", async () => {
    relayer = new RelayerNode({
      transports: {},
      getChainId: async () => HARDHAT_CHAIN_ID,
      poolSize: 1,
    });

    const keypair = await relayer.generateKeypair();

    expect(keypair).toBeDefined();
    expect(keypair.publicKey).toBeTruthy();
    expect(keypair.privateKey).toBeTruthy();
    expect(typeof keypair.publicKey).toBe("string");
    expect(typeof keypair.privateKey).toBe("string");
  }, 30_000);

  it("terminates cleanly after use", async () => {
    relayer = new RelayerNode({
      transports: {},
      getChainId: async () => HARDHAT_CHAIN_ID,
      poolSize: 1,
    });

    // Initialize the pool by calling an operation
    await relayer.generateKeypair();

    // Terminate and verify subsequent calls reject
    relayer.terminate();
    await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
    relayer = null; // already terminated
  }, 30_000);
});
