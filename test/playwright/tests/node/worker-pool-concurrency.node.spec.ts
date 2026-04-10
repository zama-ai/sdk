/**
 * Scenario: A high-throughput backend fires concurrent FHE requests through
 * a multi-worker pool to verify parallelism and clean shutdown.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { HardhatConfig, type FhevmInstanceConfig } from "@zama-fhe/sdk";

function createRelayer(transport: FhevmInstanceConfig, poolSize: number) {
  return new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: transport,
    },
    poolSize,
  });
}

test("2-worker pool generates 4 unique keypairs concurrently", async ({ transport }) => {
  using relayer = createRelayer(transport, 2);
  const results = await Promise.all([
    relayer.generateKeypair(),
    relayer.generateKeypair(),
    relayer.generateKeypair(),
    relayer.generateKeypair(),
  ]);
  expect(results).toHaveLength(4);
  const publicKeys = new Set(results.map((r) => r.publicKey));
  expect(publicKeys.size).toBe(4);
});

test("4-worker pool handles parallel EIP-712 creation", async ({ transport, contracts }) => {
  using relayer = createRelayer(transport, 4);
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
  }
});

test("terminate shuts down all workers in the pool", async ({ transport }) => {
  const relayer = createRelayer(transport, 2);
  await relayer.generateKeypair();
  relayer.terminate();
  await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
});

test("concurrent init requests share pool initialization", async ({ transport }) => {
  using relayer = createRelayer(transport, 2);
  const [kp1, kp2] = await Promise.all([relayer.generateKeypair(), relayer.generateKeypair()]);
  expect(kp1.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(kp2.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
});
