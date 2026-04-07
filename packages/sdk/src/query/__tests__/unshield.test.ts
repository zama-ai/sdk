import { describe, expect, test } from "../../test-fixtures";
import { unshieldMutationOptions } from "../unshield";

describe("unshieldMutationOptions", () => {
  test("delegates unshield", async ({ mockToken }) => {
    const options = unshieldMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.unshield", mockToken.address]);
    await options.mutationFn({ amount: 11n });
    expect(mockToken.unshield).toHaveBeenCalledWith(11n, {});
  });

  test("delegates callbacks when provided", async ({ mockToken }) => {
    const options = unshieldMutationOptions(mockToken);
    const onUnwrapSubmitted = () => undefined;
    const onFinalizing = () => undefined;

    await options.mutationFn({ amount: 12n, onUnwrapSubmitted, onFinalizing });
    expect(mockToken.unshield).toHaveBeenCalledWith(
      12n,
      expect.objectContaining({ onUnwrapSubmitted, onFinalizing }),
    );
  });
});
