import { describe, expect, test } from "../../test-fixtures";
import { resumeUnshieldMutationOptions } from "../resume-unshield";

describe("resumeUnshieldMutationOptions", () => {
  test("delegates resumeUnshield", async ({ mockWrappedToken }) => {
    const options = resumeUnshieldMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.resumeUnshield", mockWrappedToken.address]);
    await options.mutationFn({
      unwrapTxHash: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockWrappedToken.resumeUnshield).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      {},
    );
  });

  test("passes flat callbacks to resumeUnshield", async ({ mockWrappedToken }) => {
    const options = resumeUnshieldMutationOptions(mockWrappedToken);
    const onUnwrapSubmitted = () => {};
    const onFinalizing = () => {};

    await options.mutationFn({
      unwrapTxHash: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      onUnwrapSubmitted,
      onFinalizing,
    });
    expect(mockWrappedToken.resumeUnshield).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      { onUnwrapSubmitted, onFinalizing },
    );
  });
});
