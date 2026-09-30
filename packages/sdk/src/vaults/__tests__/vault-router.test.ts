import type { Address } from "viem";
import { vi } from "vitest";
import { EncryptionFailedError } from "../../errors";
import { describe, expect, mockEncryptedLegs, test, VALID_INPUT_PROOF } from "../../test-fixtures";
import type { AllocationLeg } from "../allocation";
import { encryptAllocation, isTokenListed, readTokenWrapperRegistry } from "../vault-router";

const ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const REGISTRY = "0x5555555555555555555555555555555555555555" as Address;
const HOLDER = "0x7777777777777777777777777777777777777777" as Address;
const BATCHER_A = "0x1111111111111111111111111111111111111111" as Address;
const BATCHER_B = "0x3333333333333333333333333333333333333333" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;

const LEGS: readonly AllocationLeg[] = [
  { batcher: BATCHER_A, token: TOKEN, amount: 1_000n },
  { batcher: BATCHER_B, token: TOKEN, amount: 0n },
];

describe("readTokenWrapperRegistry", () => {
  test("reads the registry off the router and checksums it", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(REGISTRY.toLowerCase());

    await expect(readTokenWrapperRegistry(sdk, ROUTER)).resolves.toBe(REGISTRY);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: ROUTER, functionName: "tokenWrapperRegistry" }),
    );
  });
});

describe("isTokenListed", () => {
  test("asks the registry, not the router", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(false);

    await expect(isTokenListed(sdk, REGISTRY, TOKEN.toLowerCase() as Address)).resolves.toBe(false);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY,
        functionName: "isConfidentialTokenValid",
        args: [TOKEN],
      }),
    );
  });
});

describe("encryptAllocation", () => {
  test("encrypts every leg in one input bound to the router, for the holder", async ({
    sdk,
    relayer,
  }) => {
    mockEncryptedLegs(relayer, LEGS.length);

    await encryptAllocation(sdk, ROUTER, HOLDER, LEGS);

    expect(relayer.encryptValues).toHaveBeenCalledTimes(1);
    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: ROUTER,
        userAddress: HOLDER,
        values: [
          { value: 1_000n, type: "euint64" },
          { value: 0n, type: "euint64" },
        ],
      }),
    );
  });

  test("pairs the encrypted values with their legs in order, under the one proof", async ({
    sdk,
    relayer,
  }) => {
    const [valueA, valueB] = mockEncryptedLegs(relayer, LEGS.length);

    await expect(encryptAllocation(sdk, ROUTER, HOLDER, LEGS)).resolves.toStrictEqual({
      legs: [
        { batcher: BATCHER_A, token: TOKEN, amount: valueA },
        { batcher: BATCHER_B, token: TOKEN, amount: valueB },
      ],
      inputProof: VALID_INPUT_PROOF,
    });
  });

  test("refuses an encryption that returns fewer values than legs", async ({ sdk, relayer }) => {
    mockEncryptedLegs(relayer, LEGS.length - 1);

    await expect(encryptAllocation(sdk, ROUTER, HOLDER, LEGS)).rejects.toThrow(
      EncryptionFailedError,
    );
  });
});
