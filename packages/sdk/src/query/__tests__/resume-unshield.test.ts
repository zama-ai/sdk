import { describe, expect, test } from "../../test-fixtures";
import { resumeUnshieldMutationOptions } from "../resume-unshield";

describe("resumeUnshieldMutationOptions", () => {
  test("delegates resumeUnshield", async ({ mockToken }) => {
    const options = resumeUnshieldMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.resumeUnshield", mockToken.address]);
    await options.mutationFn({
      unwrapTxHash: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockToken.resumeUnshield).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      {},
    );
  });

  test("passes flat callbacks to resumeUnshield", async ({ mockToken }) => {
    const options = resumeUnshieldMutationOptions(mockToken);
    const onUnwrapSubmitted = () => {};
    const onFinalizing = () => {};

    await options.mutationFn({
      unwrapTxHash: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      onUnwrapSubmitted,
      onFinalizing,
    });
    expect(mockToken.resumeUnshield).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      { onUnwrapSubmitted, onFinalizing },
    );
  });
});
