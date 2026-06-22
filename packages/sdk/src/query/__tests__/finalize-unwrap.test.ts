import { describe, expect, test } from "../../test-fixtures";
import { finalizeUnwrapMutationOptions } from "../finalize-unwrap";

describe("finalizeUnwrapMutationOptions", () => {
  test("delegates finalizeUnwrap with unwrapRequestId", async ({ mockWrappedToken }) => {
    const options = finalizeUnwrapMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.finalizeUnwrap", mockWrappedToken.address]);
    await options.mutationFn({
      unwrapRequestId: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockWrappedToken.finalizeUnwrap).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });
});
