import { describe, expect, test } from "../../test-fixtures";
import { unshieldAllMutationOptions } from "../unshield-all";

describe("unshieldAllMutationOptions", () => {
  test("delegates unshieldAll", async ({ mockToken }) => {
    const options = unshieldAllMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.unshieldAll", mockToken.address]);
    await options.mutationFn(undefined);
    expect(mockToken.unshieldAll).toHaveBeenCalledWith(undefined);
  });

  test("passes flat callbacks to unshieldAll", async ({ mockToken }) => {
    const options = unshieldAllMutationOptions(mockToken, mockToken.address);
    const onUnwrapSubmitted = () => {};
    const onFinalizing = () => {};

    await options.mutationFn({ onUnwrapSubmitted, onFinalizing });
    expect(mockToken.unshieldAll).toHaveBeenCalledWith({ onUnwrapSubmitted, onFinalizing });
  });
});
