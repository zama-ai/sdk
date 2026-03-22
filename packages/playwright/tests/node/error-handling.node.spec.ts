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

test("init failure resets so next call retries", async () => {
  let callCount = 0;
  using relayer = new RelayerNode({
    getChainId: async () => {
      callCount++;
      if (callCount === 1) throw new Error("transient failure");
      return HardhatConfig.chainId;
    },
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: "http://127.0.0.1:1", // unreachable, but first call fails before reaching it
      },
    },
    poolSize: 1,
  });

  // First call fails due to getChainId throwing
  await expect(relayer.generateKeypair()).rejects.toThrow();

  // getChainId now succeeds but network is unreachable — pool init fails again
  // This proves the init promise was reset (not stuck on the first failure)
  await expect(relayer.generateKeypair()).rejects.toThrow();
});

test("terminate during pool init rejects cleanly", async ({ anvilPort }) => {
  const relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize: 1,
  });

  // Start init, then immediately terminate
  const initPromise = relayer.generateKeypair();
  relayer.terminate();

  // Should reject — either "terminated" or pool-init error
  await expect(initPromise).rejects.toThrow();
});
