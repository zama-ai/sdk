import { describe, expect, test } from "../../test-fixtures";
import { confidentialTransferMutationOptions } from "../transfer";

describe("confidentialTransferMutationOptions", () => {
  test("delegates transfer", async ({ mockToken }) => {
    const options = confidentialTransferMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.confidentialTransfer", mockToken.address]);
    await options.mutationFn({ to: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B", amount: 3n });
    expect(mockToken.confidentialTransfer).toHaveBeenCalledWith(
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      3n,
      {},
    );
  });
});
