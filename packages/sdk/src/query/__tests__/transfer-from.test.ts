import { describe, expect, test } from "../../test-fixtures";
import { confidentialTransferFromMutationOptions } from "../transfer-from";

describe("confidentialTransferFromMutationOptions", () => {
  test("delegates transferFrom", async ({ mockToken }) => {
    const options = confidentialTransferFromMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.confidentialTransferFrom", mockToken.address]);
    await options.mutationFn({
      from: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      to: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      amount: 4n,
    });
    expect(mockToken.confidentialTransferFrom).toHaveBeenCalledWith(
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      4n,
      undefined,
    );
  });
});
