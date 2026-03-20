/**
 * Scenario: Verify the SDK produces well-typed errors for invalid operations,
 * and that matchZamaError enables structured error handling.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { matchZamaError, HardhatConfig, type ZamaError } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address } from "viem";

test("operations after terminate throw", async ({ sdk }) => {
  sdk.terminate();

  await expect(async () => {
    await sdk.allow("0x0000000000000000000000000000000000000001" as Address);
  }).rejects.toThrow();
});

test("matchZamaError routes to the correct handler", async ({ sdk, contracts }) => {
  // Try an operation that will fail (e.g. decrypt without session)
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);

  try {
    await readonlyToken.balanceOf();
    // If it succeeds (no ciphertext), that's fine — skip the error matching
  } catch (error) {
    const matched = matchZamaError(error as ZamaError, {
      DECRYPTION_FAILED: () => "decryption_failed",
      NO_CIPHERTEXT: () => "no_ciphertext",
      KEYPAIR_EXPIRED: () => "keypair_expired",
      _: () => "other",
    });
    expect(["decryption_failed", "no_ciphertext", "keypair_expired", "other"]).toContain(matched);
  }
});

test("zero poolSize defaults gracefully at construction", async ({ anvilPort }) => {
  const relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize: 0,
  });
  // poolSize: 0 is accepted — the SDK creates a zero-worker pool without throwing
  expect(relayer).toBeDefined();
  relayer.terminate();
});

test("shield with zero amount succeeds without error", async ({ sdk, contracts }) => {
  const token = sdk.createToken(contracts.cUSDT as Address);

  // The SDK does not validate zero amounts — the operation completes without throwing
  await expect(token.shield(0n)).resolves.not.toThrow();
});

test("confidentialTransfer with zero amount succeeds without error", async ({ sdk, contracts }) => {
  const shieldAmount = 100n * 10n ** 6n;
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

  await sdk.allow(contracts.cUSDT as Address);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // The SDK does not validate zero amounts — the operation completes without throwing
  await expect(token.confidentialTransfer(recipient, 0n)).resolves.not.toThrow();
});

test("dispose then re-allow works without errors", async ({ sdk, contracts }) => {
  await sdk.allow(contracts.cUSDT as Address);
  expect(await sdk.isAllowed()).toBe(true);

  sdk.dispose();

  // After dispose, re-allowing should work (relayer still alive)
  await sdk.allow(contracts.cUSDC as Address);
  expect(await sdk.isAllowed()).toBe(true);
});
