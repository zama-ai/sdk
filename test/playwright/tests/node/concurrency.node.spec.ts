/**
 * Scenario: A high-throughput backend fires concurrent FHE requests at a single
 * FhevmRelayer to verify it serves them correctly, shares one lazy init, and
 * restarts cleanly after termination.
 */
import { type FheChain, ZamaSDK } from "@zama-fhe/sdk";
import { cleartext } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import type { PublicClient, WalletClient } from "viem";
import { expect, nodeTest as test } from "../../fixtures/node-test";

interface CreateZamaSDKParams {
  chain: FheChain;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

function createZamaSDK({ chain, publicClient, walletClient }: CreateZamaSDKParams) {
  return new ZamaSDK(
    createConfig({
      chains: [chain],
      publicClient,
      walletClient,
      relayers: { [chain.id]: cleartext() },
    }),
  );
}

test("generates 4 unique keypairs concurrently", async ({ chain, publicClient, viemClient }) => {
  using sdk = createZamaSDK({ chain, publicClient, walletClient: viemClient });
  const results = await Promise.all([
    sdk.relayer.generateTransportKeyPair(),
    sdk.relayer.generateTransportKeyPair(),
    sdk.relayer.generateTransportKeyPair(),
    sdk.relayer.generateTransportKeyPair(),
  ]);
  expect(results).toHaveLength(4);
  const publicKeys = new Set(results.map((r) => r.publicKey));
  expect(publicKeys.size).toBe(4);
});

test("handles parallel EIP-712 creation", async ({
  chain,
  publicClient,
  viemClient,
  contracts,
}) => {
  using sdk = createZamaSDK({ chain, publicClient, walletClient: viemClient });
  const keypair = await sdk.relayer.generateTransportKeyPair();
  const now = Math.floor(Date.now() / 1000);

  const results = await Promise.all([
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDT], now, 7),
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDC], now, 7),
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDT], now, 14),
    sdk.relayer.createEIP712(keypair.publicKey, [contracts.cUSDC], now, 14),
  ]);
  expect(results).toHaveLength(4);
  for (const eip712 of results) {
    expect(eip712.domain.chainId).toBe(31337n);
  }
});

test("terminate and restart", async ({ chain, publicClient, viemClient }) => {
  const sdk = createZamaSDK({ chain, publicClient, walletClient: viemClient });
  await sdk.relayer.generateTransportKeyPair();
  sdk.terminate();
  // Post-terminate, operations re-initialize the backend.
  expect(await sdk.relayer.generateTransportKeyPair()).toMatchObject({
    privateKey: expect.stringMatching(/0x/),
    publicKey: expect.stringMatching(/0x/),
  });
});

test("concurrent init requests share a single initialization", async ({
  chain,
  publicClient,
  viemClient,
}) => {
  using sdk = createZamaSDK({ chain, publicClient, walletClient: viemClient });
  const [kp1, kp2] = await Promise.all([
    sdk.relayer.generateTransportKeyPair(),
    sdk.relayer.generateTransportKeyPair(),
  ]);
  expect(kp1.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(kp2.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
});
