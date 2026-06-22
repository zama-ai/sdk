import { describe, expect, test } from "../../test-fixtures";
import { unshieldAllMutationOptions } from "../unshield-all";

describe("unshieldAllMutationOptions", () => {
  test("delegates unshieldAll", async ({ mockWrappedToken }) => {
    const options = unshieldAllMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.unshieldAll", mockWrappedToken.address]);
    await options.mutationFn(undefined);
    expect(mockWrappedToken.unshieldAll).toHaveBeenCalledWith(undefined);
  });

  test("passes flat callbacks to unshieldAll", async ({ mockWrappedToken }) => {
    const options = unshieldAllMutationOptions(mockWrappedToken);
    const onUnwrapSubmitted = () => {};
    const onFinalizing = () => {};

    await options.mutationFn({ onUnwrapSubmitted, onFinalizing });
    expect(mockWrappedToken.unshieldAll).toHaveBeenCalledWith({ onUnwrapSubmitted, onFinalizing });
  });
});
