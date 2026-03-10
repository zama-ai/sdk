import { describe, expect, test } from "../../test-fixtures";
import { delegateDecryptionMutationOptions } from "../delegate-decryption";

describe("delegateDecryptionMutationOptions", () => {
  test("delegates delegateDecryption", async ({ mockToken }) => {
    const options = delegateDecryptionMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.delegateDecryption", mockToken.address]);
    await options.mutationFn({
      delegateAddress: "0x2222222222222222222222222222222222222222",
    });
    expect(mockToken.delegateDecryption).toHaveBeenCalledWith({
      delegateAddress: "0x2222222222222222222222222222222222222222",
      expirationDate: undefined,
    });
  });

  test("passes options through", async ({ mockToken }) => {
    const options = delegateDecryptionMutationOptions(mockToken);
    const expirationDate = new Date("2030-01-01");

    await options.mutationFn({
      delegateAddress: "0x2222222222222222222222222222222222222222",
      expirationDate,
    });
    expect(mockToken.delegateDecryption).toHaveBeenCalledWith({
      delegateAddress: "0x2222222222222222222222222222222222222222",
      expirationDate,
    });
  });
});
