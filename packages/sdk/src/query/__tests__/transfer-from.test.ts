import { describe, expect, test } from "../../test-fixtures";
import { confidentialTransferFromMutationOptions } from "../transfer-from";

describe("confidentialTransferFromMutationOptions", () => {
  test("delegates transferFrom", async ({ mockToken }) => {
    const options = confidentialTransferFromMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.confidentialTransferFrom", mockToken.address]);
    await options.mutationFn({
      from: "0x2222222222222222222222222222222222222222",
      to: "0x3333333333333333333333333333333333333333",
      amount: 4n,
    });
    expect(mockToken.confidentialTransferFrom).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      4n,
      undefined,
    );
  });
});
