import { describe, expect, test } from "../../test-fixtures";
import { ConfigurationError } from "../../errors";
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

  test("accepts burnAmount as alternative input", async ({ mockWrappedToken }) => {
    const options = finalizeUnwrapMutationOptions(mockWrappedToken);

    await options.mutationFn({
      burnAmount: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbb",
    });

    expect(mockWrappedToken.finalizeUnwrap).toHaveBeenCalledWith(
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbb",
    );
  });

  test("throws ConfigurationError when no encrypted value is provided", async ({
    mockWrappedToken,
  }) => {
    const options = finalizeUnwrapMutationOptions(mockWrappedToken);

    await expect(options.mutationFn({} as never)).rejects.toThrow(ConfigurationError);
    expect(mockWrappedToken.finalizeUnwrap).not.toHaveBeenCalled();
  });
});
