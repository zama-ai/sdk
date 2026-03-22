/**
 * Scenario: A user connects a wallet, authorizes tokens, performs operations,
 * disconnects, then reconnects — the full session lifecycle.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { MemoryStorage, ZamaSDK, HardhatConfig } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";

test("allow → shield → revoke → re-allow → revokeSession", async ({ sdk, contracts }) => {
  // Fresh session
  expect(await sdk.isAllowed()).toBe(false);

  // Authorize tokens (triggers wallet signature)
  await sdk.allow(contracts.cUSDT as Address);
  expect(await sdk.isAllowed()).toBe(true);

  // Shield works while session is active
  const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  await token.shield(100n * 10n ** 6n);

  // Explicit revoke
  await sdk.revoke(contracts.cUSDT as Address);
  expect(await sdk.isAllowed()).toBe(false);

  // Re-authorize (simulates reconnection)
  await sdk.allow(contracts.cUSDC as Address);
  expect(await sdk.isAllowed()).toBe(true);

  // Disconnect — revokeSession clears without specifying tokens
  await sdk.revokeSession();
  expect(await sdk.isAllowed()).toBe(false);
});

test("allow multiple tokens in one call", async ({ sdk, contracts }) => {
  await sdk.allow(contracts.cUSDT as Address, contracts.cUSDC as Address);
  expect(await sdk.isAllowed()).toBe(true);
});

test("per-token allow shares the same session", async ({ sdk, contracts }) => {
  const tokenUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const tokenUSDC = sdk.createReadonlyToken(contracts.cUSDC as Address);

  // Allow via one token creates a session keypair shared with all tokens
  await tokenUSDT.allow();
  expect(await tokenUSDT.isAllowed()).toBe(true);
  expect(await tokenUSDC.isAllowed()).toBe(true);

  // Revoking clears the shared session
  await tokenUSDT.revoke(contracts.cUSDT as Address);
  expect(await tokenUSDT.isAllowed()).toBe(false);
  expect(await tokenUSDC.isAllowed()).toBe(false);
});

test("dispose unsubscribes without terminating relayer", async ({ sdk }) => {
  sdk.dispose();
  // Relayer still works after dispose
  const keypair = await sdk.relayer.generateKeypair();
  expect(keypair.publicKey).toBeDefined();
  sdk.terminate();
});

test("two accounts maintain independent sessions concurrently", async ({
  sdk: sdk0,
  contracts,
  anvilPort,
}) => {
  const account1Pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const account1 = privateKeyToAccount(account1Pk);
  const transport = http(`http://127.0.0.1:${anvilPort}`);
  const publicClient = createPublicClient({ chain: foundry, transport }) as PublicClient;
  const walletClient = createWalletClient({ account: account1, chain: foundry, transport });
  const relayer1 = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize: 1,
  });
  const sdk1 = new ZamaSDK({
    relayer: relayer1,
    signer: new ViemSigner({ walletClient, publicClient }),
    storage: new MemoryStorage(),
  });

  try {
    // Both accounts allow the same token — sessions should be independent
    await sdk0.allow(contracts.cUSDT as Address);
    await sdk1.allow(contracts.cUSDT as Address);

    expect(await sdk0.isAllowed()).toBe(true);
    expect(await sdk1.isAllowed()).toBe(true);

    // Revoking account #0 does not affect account #1
    await sdk0.revokeSession();
    expect(await sdk0.isAllowed()).toBe(false);
    expect(await sdk1.isAllowed()).toBe(true);
  } finally {
    sdk1.terminate();
    relayer1.terminate();
  }
});
