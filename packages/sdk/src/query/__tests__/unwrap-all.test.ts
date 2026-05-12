import { describe, expect, test } from "../../test-fixtures";
import { unwrapAllMutationOptions } from "../unwrap-all";

describe("unwrapAllMutationOptions", () => {
  test("delegates unwrapAll", async ({ mockWrappedToken }) => {
    const options = unwrapAllMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.unwrapAll", mockWrappedToken.address]);
    await options.mutationFn();
    expect(mockWrappedToken.unwrapAll).toHaveBeenCalled();
  });
});
