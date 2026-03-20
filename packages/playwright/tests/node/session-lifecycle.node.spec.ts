/**
 * Journey: A user connects a wallet, authorizes tokens, performs operations,
 * disconnects, then reconnects — the full session lifecycle.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

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
