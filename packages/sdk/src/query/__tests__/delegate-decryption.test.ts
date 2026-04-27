import { describe, expect, test } from "../../test-fixtures";
import { delegateDecryptionMutationOptions } from "../delegate-decryption";

describe("delegateDecryptionMutationOptions", () => {
  test("delegates delegateDecryption", async ({ mockToken }) => {
    const options = delegateDecryptionMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.delegateDecryption", mockToken.address]);
    await options.mutationFn({
      delegateAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    });
    expect(mockToken.delegateDecryption).toHaveBeenCalledWith({
      delegateAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      expirationDate: undefined,
    });
  });

  test("passes options through", async ({ mockToken }) => {
    const options = delegateDecryptionMutationOptions(mockToken, mockToken.address);
    const expirationDate = new Date("2030-01-01");

    await options.mutationFn({
      delegateAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      expirationDate,
    });
    expect(mockToken.delegateDecryption).toHaveBeenCalledWith({
      delegateAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      expirationDate,
    });
  });
});
