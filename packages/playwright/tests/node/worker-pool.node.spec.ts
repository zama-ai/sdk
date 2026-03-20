import { nodeTest as test, expect } from "../../fixtures/node-test";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { HardhatConfig } from "@zama-fhe/sdk";

function createRelayer(anvilPort: number, poolSize: number) {
  return new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize,
  });
}

test.describe("NodeWorkerPool — multi-worker behavior", () => {
  test("pool with 2 workers generates keypairs concurrently", async ({ anvilPort }) => {
    const relayer = createRelayer(anvilPort, 2);
    try {
      // Fire 4 concurrent keypair requests — should distribute across 2 workers
      const results = await Promise.all([
        relayer.generateKeypair(),
        relayer.generateKeypair(),
        relayer.generateKeypair(),
        relayer.generateKeypair(),
      ]);

      expect(results).toHaveLength(4);
      for (const kp of results) {
        expect(kp.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
        expect(kp.privateKey).toMatch(/^0x[0-9a-fA-F]+$/);
      }

      // All keypairs should be unique
      const publicKeys = new Set(results.map((r) => r.publicKey));
      expect(publicKeys.size).toBe(4);
    } finally {
      relayer.terminate();
    }
  });

  test("pool with 4 workers handles parallel EIP-712 creation", async ({
    anvilPort,
    contracts,
  }) => {
    const relayer = createRelayer(anvilPort, 4);
    try {
      const keypair = await relayer.generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const results = await Promise.all([
        relayer.createEIP712(keypair.publicKey, [contracts.cUSDT], now, 7),
        relayer.createEIP712(keypair.publicKey, [contracts.cUSDC], now, 7),
        relayer.createEIP712(keypair.publicKey, [contracts.cUSDT], now, 14),
        relayer.createEIP712(keypair.publicKey, [contracts.cUSDC], now, 14),
      ]);

      expect(results).toHaveLength(4);
      for (const eip712 of results) {
        expect(eip712.domain.chainId).toBe(31337);
        expect(eip712.message.publicKey).toBe(keypair.publicKey);
      }
    } finally {
      relayer.terminate();
    }
  });

  test("terminate shuts down all workers", async ({ anvilPort }) => {
    const relayer = createRelayer(anvilPort, 2);

    // Initialize the pool by making a request
    await relayer.generateKeypair();

    relayer.terminate();

    // After terminate, all operations should fail
    await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
  });

  test("pool initialization is idempotent under concurrent calls", async ({ anvilPort }) => {
    const relayer = createRelayer(anvilPort, 2);
    try {
      // Fire concurrent requests that all trigger pool initialization
      const results = await Promise.all([relayer.generateKeypair(), relayer.generateKeypair()]);

      expect(results).toHaveLength(2);
      expect(results[0]!.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(results[1]!.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
    } finally {
      relayer.terminate();
    }
  });
});
