/**
 * Scenario: Verify SDK/RelayerNode error behaviour and typed error matching.
 * Domain-level error scenarios are covered by the browser e2e suite.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import {
  matchZamaError,
  HardhatConfig,
  DecryptionFailedError,
  NoCiphertextError,
} from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";

test("operations after terminate throw", async ({ sdk }) => {
  sdk.terminate();

  await expect(async () => {
    await sdk.allow("0x0000000000000000000000000000000000000001" as `0x${string}`);
  }).rejects.toThrow();
});

test("matchZamaError routes to the correct handler", async () => {
  const decErr = new DecryptionFailedError("test decryption failure");
  expect(
    matchZamaError(decErr, {
      DECRYPTION_FAILED: () => "decryption_failed",
      _: () => "other",
    }),
  ).toBe("decryption_failed");

  const noCipherErr = new NoCiphertextError("no ciphertext");
  expect(
    matchZamaError(noCipherErr, {
      NO_CIPHERTEXT: () => "no_ciphertext",
      _: () => "other",
    }),
  ).toBe("no_ciphertext");

  // Fallback handler receives unmatched codes
  expect(
    matchZamaError(decErr, {
      NO_CIPHERTEXT: () => "no_ciphertext",
      _: () => "fallback",
    }),
  ).toBe("fallback");
});

test("zero poolSize defaults gracefully at construction", async ({ anvilPort }) => {
  using relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize: 0,
  });
  expect(relayer).toBeDefined();
});
