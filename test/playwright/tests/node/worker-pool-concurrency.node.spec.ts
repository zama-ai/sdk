/**
 * Scenario: A high-throughput backend fires concurrent FHE requests through
 * a multi-worker pool to verify parallelism and clean shutdown.
 */
import { type FheChain, ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import type { PublicClient, WalletClient } from "viem";
import { expect, nodeTest as test } from "../../fixtures/node-test";

interface CreateZamaSDKParams {
  chain: FheChain;
  publicClient: PublicClient;
  walletClient: WalletClient;
  poolSize: number;
}

function createZamaSDK({ chain, publicClient, walletClient, poolSize }: CreateZamaSDKParams) {
  return new ZamaSDK(
    createConfig({
      chains: [chain],
      publicClient,
      walletClient,
      transports: { [chain.id]: node(chain, { poolSize }) },
    }),
  );
}

test("2-worker pool generates 4 unique keypairs concurrently", async ({
  chain,
  publicClient,
  viemClient,
}) => {
  using sdk = createZamaSDK({
    chain,
    publicClient,
    walletClient: viemClient,
    poolSize: 2,
  });
  const results = await Promise.all([
    sdk.relayer.generateKeypair(),
    sdk.relayer.generateKeypair(),
    sdk.relayer.generateKeypair(),
    sdk.relayer.generateKeypair(),
  ]);
  expect(results).toHaveLength(4);
  const publicKeys = new Set(results.map((r) => r.publicKey));
  expect(publicKeys.size).toBe(4);
});

test("4-worker pool handles parallel EIP-712 creation", async ({
  chain,
  publicClient,
  viemClient,
  contracts,
}) => {
  using sdk = createZamaSDK({
    chain,
    publicClient,
    walletClient: viemClient,
    poolSize: 4,
  });
  const keypair = await sdk.relayer.generateKeypair();
  const now = Math.floor(Date.now() / 1000);

  const results = await Promise.all([
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDT], now, 7),
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDC], now, 7),
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDT], now, 14),
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDC], now, 14),
  ]);
  expect(results).toHaveLength(4);
  for (const eip712 of results) {
    expect(eip712.domain.chainId).toBe(31337);
  }
});

test("terminate and restart", async ({ chain, publicClient, viemClient }) => {
  const sdk = createZamaSDK({
    chain,
    publicClient,
    walletClient: viemClient,
    poolSize: 2,
  });
  await sdk.relayer.generateKeypair();
  sdk.terminate();
  // Post-terminate, operations restart the pool
  expect(await sdk.relayer.generateKeypair()).toMatchObject({
    privateKey: expect.stringMatching(/0x/),
    publicKey: expect.stringMatching(/0x/),
  });
});

test("concurrent init requests share pool initialization", async ({
  chain,
  publicClient,
  viemClient,
}) => {
  using sdk = createZamaSDK({
    chain,
    publicClient,
    walletClient: viemClient,
    poolSize: 2,
  });
  const [kp1, kp2] = await Promise.all([
    sdk.relayer.generateKeypair(),
    sdk.relayer.generateKeypair(),
  ]);
  expect(kp1.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(kp2.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
});
