import { describe, expect, test } from "../../test-fixtures";
import { unwrapAllMutationOptions } from "../unwrap-all";

describe("unwrapAllMutationOptions", () => {
  test("delegates unwrapAll", async ({ mockToken }) => {
    const options = unwrapAllMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.unwrapAll", mockToken.address]);
    await options.mutationFn();
    expect(mockToken.unwrapAll).toHaveBeenCalled();
  });
});
