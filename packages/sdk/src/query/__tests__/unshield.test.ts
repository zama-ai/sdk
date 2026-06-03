import { describe, expect, test } from "../../test-fixtures";
import { unshieldMutationOptions } from "../unshield";

describe("unshieldMutationOptions", () => {
  test("delegates unshield", async ({ mockWrappedToken }) => {
    const options = unshieldMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.unshield", mockWrappedToken.address]);
    await options.mutationFn({ amount: 11n });
    expect(mockWrappedToken.unshield).toHaveBeenCalledWith(11n, {});
  });

  test("delegates callbacks when provided", async ({ mockWrappedToken }) => {
    const options = unshieldMutationOptions(mockWrappedToken);
    const onUnwrapSubmitted = () => undefined;
    const onFinalizing = () => undefined;

    await options.mutationFn({ amount: 12n, onUnwrapSubmitted, onFinalizing });
    expect(mockWrappedToken.unshield).toHaveBeenCalledWith(
      12n,
      expect.objectContaining({ onUnwrapSubmitted, onFinalizing }),
    );
  });
});
