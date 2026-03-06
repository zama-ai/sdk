import { describe, expect, test } from "../../test-fixtures";
import { finalizeUnwrapMutationOptions } from "../finalize-unwrap";

describe("finalizeUnwrapMutationOptions", () => {
  test("delegates finalizeUnwrap", async ({ mockToken }) => {
    const options = finalizeUnwrapMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.finalizeUnwrap", mockToken.address]);
    await options.mutationFn({
      burnAmountHandle: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockToken.finalizeUnwrap).toHaveBeenCalledWith(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });
});
