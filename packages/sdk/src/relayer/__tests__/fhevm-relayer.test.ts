import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the `@fhevm/sdk` client factories so we can observe the options the
// FhevmRelayer merges into each call without any real FHE or network work.
const { fhevmClient, createFhevmClient, createFhevmCleartextClient } = vi.hoisted(() => {
  const client = {
    init: vi.fn(async () => {}),
    encryptValues: vi.fn(async () => ({ encryptedValues: [], inputProof: "0x" })),
    decryptPublicValuesWithSignatures: vi.fn(async () => ({
      clearValues: [],
      checkSignaturesArgs: { handlesList: [], abiEncodedCleartexts: "0x", decryptionProof: "0x" },
    })),
  };
  return {
    fhevmClient: client,
    createFhevmClient: vi.fn(() => client),
    createFhevmCleartextClient: vi.fn(() => client),
  };
});

vi.mock("@fhevm/sdk/viem", () => ({ createFhevmClient }));
vi.mock("@fhevm/sdk/viem/cleartext", () => ({ createFhevmCleartextClient }));

import { anvil } from "../../chains";
import { FhevmRelayer } from "../fhevm-relayer";

const CONTRACT = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const USER = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
// The relayer only passes these through to the mocked client; the exact FHE
// payload shape is irrelevant to the option-merging behaviour under test.
const encryptArgs = { contractAddress: CONTRACT, userAddress: USER, values: [] };

function clientOptionsFromLastConstruction(): Record<string, unknown> | undefined {
  const args = createFhevmClient.mock.calls.at(-1)?.at(0) as unknown as {
    options?: Record<string, unknown>;
  };
  return args?.options;
}

function optionsFromLastEncrypt(): Record<string, unknown> | undefined {
  const args = fhevmClient.encryptValues.mock.calls.at(-1)?.at(0) as unknown as {
    options?: Record<string, unknown>;
  };
  return args?.options;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FhevmRelayer request options", () => {
  test("applies the transport-level timeout default to every relayer call", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.encryptValues(encryptArgs);
    expect(optionsFromLastEncrypt()).toMatchObject({ timeout: 5_000, fetchRetries: 2 });
  });

  test("lets a per-call timeout override the transport default", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.encryptValues({ ...encryptArgs, options: { timeout: 10 } });
    expect(optionsFromLastEncrypt()).toMatchObject({ timeout: 10 });
  });

  test("applies the transport timeout on the public-decrypt path too", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 7_000 } });
    await relayer.decryptPublicValuesWithSignatures({ encryptedValues: [] } as never);
    const args = fhevmClient.decryptPublicValuesWithSignatures.mock.calls
      .at(-1)
      ?.at(0) as unknown as { options?: Record<string, unknown> };
    expect(args?.options).toMatchObject({ timeout: 7_000 });
  });

  test("does not leak timeout into the @fhevm/sdk client options", () => {
    new FhevmRelayer({ chain: anvil, options: { timeout: 5_000, batchRpcCalls: true } });
    const clientOptions = clientOptionsFromLastConstruction();
    expect(clientOptions).toMatchObject({ batchRpcCalls: true });
    expect(clientOptions).not.toHaveProperty("timeout");
  });

  test("carries no timeout in the defaults when none is configured", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.encryptValues(encryptArgs);
    const options = optionsFromLastEncrypt();
    expect(options).toMatchObject({ fetchRetries: 2 });
    expect(options?.timeout).toBeUndefined();
  });
});
