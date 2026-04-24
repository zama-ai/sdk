import { describe, expect, test } from "../../test-fixtures";
import { unwrapMutationOptions } from "../unwrap";

describe("unwrapMutationOptions", () => {
  test("delegates unwrap", async ({ mockToken }) => {
    const options = unwrapMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.unwrap", mockToken.address]);
    await options.mutationFn({ amount: 12n });
    expect(mockToken.unwrap).toHaveBeenCalledWith(12n);
  });
});
