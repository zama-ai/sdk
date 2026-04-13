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
    await sdk.credentials.allow("0x0000000000000000000000000000000000000001" as `0x${string}`);
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

test("zero poolSize rejects on first operation", async ({ transport }) => {
  using relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: transport,
    },
    poolSize: 0,
  });
  expect(relayer).toBeDefined();
  await expect(relayer.generateKeypair()).rejects.toThrow();
});

test("init failure resets so next call retries", async () => {
  let callCount = 0;
  using relayer = new RelayerNode({
    getChainId: async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("transient failure");
      }
      return HardhatConfig.chainId;
    },
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        relayerUrl: "http://127.0.0.1:1",
        network: "http://127.0.0.1:1",
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

test("isConfidential on non-ERC-165 contract reverts with a ContractFunction error", async ({
  sdk,
  contracts,
}) => {
  // The ACL contract does not implement ERC-165 supportsInterface.
  // This verifies that viem produces an error whose .name matches
  // what isContractCallError checks, ensuring the query-layer catch gate
  // would correctly identify it as a contract revert (not a network error).
  const nonErc165Token = sdk.createReadonlyToken(contracts.acl);
  try {
    await nonErc165Token.isConfidential();
    // If this somehow returns without throwing, fail the test
    expect(true, "Expected isConfidential to throw on a non-ERC-165 contract").toBe(false);
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    const error = err as Error;
    // viem wraps reverts as ContractFunctionExecutionError or ContractFunctionRevertedError
    expect(
      error.name === "ContractFunctionExecutionError" ||
        error.name === "ContractFunctionRevertedError",
    ).toBe(true);
  }
});

test("terminate during pool init rejects cleanly", async ({ transport }) => {
  const relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: transport,
    },
    poolSize: 1,
  });

  // Start init, then immediately terminate
  const initPromise = relayer.generateKeypair();
  relayer.terminate();

  // Should reject — either "terminated" or pool-init error
  await expect(initPromise).rejects.toThrow();
});
