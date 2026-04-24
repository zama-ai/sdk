import { describe, expect, test } from "../../test-fixtures";
import { approveUnderlyingMutationOptions } from "../approve-underlying";

describe("approveUnderlyingMutationOptions", () => {
  test("delegates approveUnderlying", async ({ mockToken }) => {
    const options = approveUnderlyingMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.approveUnderlying", mockToken.address]);
    await options.mutationFn({ amount: 9n });
    expect(mockToken.approveUnderlying).toHaveBeenCalledWith(9n);
  });
});
