import type { Address } from "viem";
import { EncryptionFailedError } from "../../errors";
import { describe, expect, mockEncryptedLegs, test, VALID_INPUT_PROOF } from "../../test-fixtures";
import type { AllocationLeg } from "../allocation";
import { encryptAllocation, encryptEuint64 } from "../encrypt";

const ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const HOLDER = "0x7777777777777777777777777777777777777777" as Address;
const BATCHER_A = "0x1111111111111111111111111111111111111111" as Address;
const BATCHER_B = "0x3333333333333333333333333333333333333333" as Address;
const TOKEN = "0x2222222222222222222222222222222222222222" as Address;

const LEGS: readonly AllocationLeg[] = [
  { batcher: BATCHER_A, token: TOKEN, amount: 1_000n },
  { batcher: BATCHER_B, token: TOKEN, amount: 0n },
];

describe("encryptEuint64", () => {
  test("encrypts one value bound to the contract, for the user", async ({ sdk, relayer }) => {
    const [handle] = mockEncryptedLegs(relayer, 1);

    await expect(encryptEuint64(sdk, 1_000n, TOKEN, HOLDER)).resolves.toStrictEqual({
      encryptedAmount: handle,
      inputProof: VALID_INPUT_PROOF,
    });
    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: TOKEN,
        userAddress: HOLDER,
        values: [{ value: 1_000n, type: "euint64" }],
      }),
    );
  });

  test("refuses an encryption that returns no values", async ({ sdk, relayer }) => {
    mockEncryptedLegs(relayer, 0);

    await expect(encryptEuint64(sdk, 1_000n, TOKEN, HOLDER)).rejects.toThrow(EncryptionFailedError);
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
