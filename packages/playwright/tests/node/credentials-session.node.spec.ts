/**
 * Scenario: Verify the programmatic credential session API and
 * AsyncLocalMapStorage — both Node-only surfaces with no browser equivalent.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { AsyncLocalMapStorage } from "@zama-fhe/sdk/node";
import { ZamaSDK } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";

// ── AsyncLocalMapStorage isolation ────────────────────────────

test("AsyncLocalMapStorage isolates data between concurrent contexts", async () => {
  const storage = new AsyncLocalMapStorage();

  const results = await Promise.all([
    storage.run(async () => {
      await storage.set("key", "context-A");
      // Yield so the other context can interleave
      await new Promise((r) => setTimeout(r, 10));
      return storage.get("key");
    }),
    storage.run(async () => {
      await storage.set("key", "context-B");
      await new Promise((r) => setTimeout(r, 10));
      return storage.get("key");
    }),
  ]);

  expect(results).toEqual(["context-A", "context-B"]);
});

test("AsyncLocalMapStorage returns null outside a run context", async () => {
  const storage = new AsyncLocalMapStorage();
  await storage.set("key", "value");
  expect(await storage.get("key")).toBeNull();
});

test("AsyncLocalMapStorage delete removes a key within context", async () => {
  const storage = new AsyncLocalMapStorage();
  await storage.run(async () => {
    await storage.set("key", "value");
    expect(await storage.get("key")).toBe("value");
    await storage.delete("key");
    expect(await storage.get("key")).toBeNull();
  });
});

// ── sdk.allow / sdk.isAllowed / sdk.revoke ────────────────────

test("allow then isAllowed returns true", async ({ sdk, contracts }) => {
  expect(await sdk.isAllowed()).toBe(false);
  await sdk.allow(contracts.cUSDT);
  expect(await sdk.isAllowed()).toBe(true);
});

test("revoke clears the session so isAllowed returns false", async ({ sdk, contracts }) => {
  await sdk.allow(contracts.cUSDT);
  expect(await sdk.isAllowed()).toBe(true);

  await sdk.revoke(contracts.cUSDT);
  expect(await sdk.isAllowed()).toBe(false);
});

test("revokeSession clears without needing contract addresses", async ({ sdk, contracts }) => {
  await sdk.allow(contracts.cUSDT);
  expect(await sdk.isAllowed()).toBe(true);

  await sdk.revokeSession();
  expect(await sdk.isAllowed()).toBe(false);
});

test("allow covers multiple contracts in one signature", async ({ sdk, contracts }) => {
  await sdk.allow(contracts.cUSDT, contracts.cUSDC);
  expect(await sdk.isAllowed()).toBe(true);
});

// ── AsyncLocalMapStorage with SDK credentials ─────────────────

test("credentials stay isolated across concurrent AsyncLocalMapStorage contexts", async ({
  transport,
  viemClient,
  relayer,
  contracts,
}) => {
  const storage = new AsyncLocalMapStorage();
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(transport.network as string),
  });
  const signer = new ViemSigner({ walletClient: viemClient, publicClient });

  const [resultA, resultB] = await Promise.all([
    storage.run(async () => {
      const sdk = new ZamaSDK({ relayer, signer, storage });
      await sdk.allow(contracts.cUSDT);
      return sdk.isAllowed();
    }),
    storage.run(async () => {
      // Second context never called allow — should be false
      const sdk = new ZamaSDK({ relayer, signer, storage });
      return sdk.isAllowed();
    }),
  ]);

  expect(resultA).toBe(true);
  expect(resultB).toBe(false);
});
