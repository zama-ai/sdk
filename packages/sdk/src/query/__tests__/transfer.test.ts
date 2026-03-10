import { describe, expect, test } from "../../test-fixtures";
import { confidentialTransferMutationOptions } from "../transfer";

describe("confidentialTransferMutationOptions", () => {
  test("delegates transfer", async ({ mockToken }) => {
    const options = confidentialTransferMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.confidentialTransfer", mockToken.address]);
    await options.mutationFn({ to: "0x2222222222222222222222222222222222222222", amount: 3n });
    expect(mockToken.confidentialTransfer).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      3n,
      undefined,
    );
  });
});
