import type { Address } from "viem";
import { EncryptionFailedError } from "../../errors";
import { describe, expect, mockEncryptedLegs, test, VALID_INPUT_PROOF } from "../../test-fixtures";
import { encryptEuint64s } from "../encrypt";

const ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const HOLDER = "0x7777777777777777777777777777777777777777" as Address;

describe("encryptEuint64s", () => {
  test("encrypts every value in one input bound to the contract, for the user", async ({
    sdk,
    relayer,
  }) => {
    const handles = mockEncryptedLegs(relayer, 2);

    await expect(
      encryptEuint64s(sdk, { values: [1_000n, 0n], contractAddress: ROUTER, userAddress: HOLDER }),
    ).resolves.toStrictEqual({ encryptedValues: handles, inputProof: VALID_INPUT_PROOF });
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

  test("refuses an encryption that returns a different number of values", async ({
    sdk,
    relayer,
  }) => {
    mockEncryptedLegs(relayer, 1);

    await expect(
      encryptEuint64s(sdk, { values: [1_000n, 0n], contractAddress: ROUTER, userAddress: HOLDER }),
    ).rejects.toThrow(EncryptionFailedError);
  });
});
