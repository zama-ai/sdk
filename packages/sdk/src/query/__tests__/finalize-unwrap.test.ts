import { describe, expect, test } from "../../test-fixtures";
import { ConfigurationError } from "../../errors";
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

  test("throws ConfigurationError when no handle is provided", async ({ mockToken }) => {
    const options = finalizeUnwrapMutationOptions(mockToken);

    await expect(options.mutationFn({} as never)).rejects.toThrow(ConfigurationError);
    expect(mockToken.finalizeUnwrap).not.toHaveBeenCalled();
  });
});
