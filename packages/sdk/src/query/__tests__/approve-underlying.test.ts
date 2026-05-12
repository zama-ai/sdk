import { describe, expect, test } from "../../test-fixtures";
import { approveUnderlyingMutationOptions } from "../approve-underlying";

describe("approveUnderlyingMutationOptions", () => {
  test("delegates approveUnderlying", async ({ mockWrappedToken }) => {
    const options = approveUnderlyingMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.approveUnderlying", mockWrappedToken.address]);
    await options.mutationFn({ amount: 9n });
    expect(mockWrappedToken.approveUnderlying).toHaveBeenCalledWith(9n);
  });
});
