import { describe, expect, test } from "../../test-fixtures";
import { unwrapMutationOptions } from "../unwrap";

describe("unwrapMutationOptions", () => {
  test("delegates unwrap", async ({ mockWrappedToken }) => {
    const options = unwrapMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.unwrap", mockWrappedToken.address]);
    await options.mutationFn({ amount: 12n });
    expect(mockWrappedToken.unwrap).toHaveBeenCalledWith(12n, {});
  });
});
