/**
 * Scenario: Verify SDK/RelayerNode error behaviour and typed error matching.
 * Domain-level error scenarios are covered by the browser e2e suite.
 */
import {
  type FheChain,
  DecryptionFailedError,
  matchZamaError,
  NoCiphertextError,
  ZamaSDK,
} from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import type { PublicClient, WalletClient } from "viem";
import { expect, nodeTest as test } from "../../fixtures/node-test";

interface CreateZamaSDKParams {
  chain: FheChain;
  publicClient: PublicClient;
  viemClient: WalletClient;
  transportOverrides?: Partial<Parameters<typeof node>[0]>;
  poolOptions?: Parameters<typeof node>[1];
}

function createZamaSDK({
  chain,
  publicClient,
  viemClient,
  transportOverrides,
  poolOptions,
}: CreateZamaSDKParams) {
  const chainOverrides = transportOverrides ? { ...chain, ...transportOverrides } : chain;
  return new ZamaSDK(
    createConfig({
      chains: [chainOverrides],
      publicClient,
      walletClient: viemClient,
      relayers: {
        [chainOverrides.id]: node(transportOverrides, poolOptions),
      },
    }),
  );
}

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

  expect(
    matchZamaError(decErr, {
      NO_CIPHERTEXT: () => "no_ciphertext",
      _: () => "fallback",
    }),
  ).toBe("fallback");
});

test("zero poolSize rejects on first operation", async ({ chain, publicClient, viemClient }) => {
  using sdk = createZamaSDK({ chain, publicClient, viemClient, poolOptions: { poolSize: 0 } });
  await expect(sdk.relayer.generateKeypair()).rejects.toThrow();
});

test("init failure resets so next call retries", async ({ chain, publicClient, viemClient }) => {
  using sdk = createZamaSDK({
    chain,
    publicClient,
    viemClient,
    transportOverrides: { relayerUrl: "http://127.0.0.1:1", network: "http://127.0.0.1:1" },
  });

  await expect(sdk.relayer.generateKeypair()).rejects.toThrow();
  await expect(sdk.relayer.generateKeypair()).rejects.toThrow();
});

test("isConfidential on non-ERC-165 contract reverts with a ContractFunction error", async ({
  sdk,
  contracts,
}) => {
  const nonErc165Token = sdk.createReadonlyToken(contracts.acl);
  try {
    await nonErc165Token.isConfidential();
    expect(true, "Expected isConfidential to throw on a non-ERC-165 contract").toBe(false);
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    const error = err as Error;
    expect(
      error.name === "ContractFunctionExecutionError" ||
        error.name === "ContractFunctionRevertedError",
    ).toBe(true);
  }
});

test("terminate during pool init rejects cleanly", async ({ chain, publicClient, viemClient }) => {
  const sdk = createZamaSDK({ chain, publicClient, viemClient });
  const initPromise = sdk.relayer.generateKeypair();
  sdk.terminate();
  await expect(initPromise).rejects.toThrow();
});
