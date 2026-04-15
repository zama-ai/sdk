import { describe, expect, test } from "../../test-fixtures";
import { finalizeUnwrapMutationOptions } from "../finalize-unwrap";

describe("finalizeUnwrapMutationOptions", () => {
  test("delegates finalizeUnwrap with unwrapRequestId", async ({ mockToken }) => {
    const options = finalizeUnwrapMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.finalizeUnwrap", mockToken.address]);
    await options.mutationFn({
      unwrapRequestId: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockToken.finalizeUnwrap).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  test("falls back to legacy burnAmountHandle", async ({ mockToken }) => {
    const options = finalizeUnwrapMutationOptions(mockToken);

    await options.mutationFn({
      burnAmountHandle: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbb",
    });

    expect(mockToken.finalizeUnwrap).toHaveBeenCalledWith(
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbb",
    );
  });
});
