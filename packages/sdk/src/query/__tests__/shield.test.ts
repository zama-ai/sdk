import { describe, expect, test } from "../../test-fixtures";
import { shieldMutationOptions } from "../shield";

describe("shieldMutationOptions", () => {
  test("creates key and delegates mutationFn", async ({ mockToken }) => {
    const options = shieldMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.shield", mockToken.address]);
    await options.mutationFn({ amount: 1n, fees: 2n, approvalStrategy: "exact" });
    expect(mockToken.shield).toHaveBeenCalledWith(1n, {
      fees: 2n,
      approvalStrategy: "exact",
    });
  });

  test("passes undefined optional shield params", async ({ mockToken }) => {
    const options = shieldMutationOptions(mockToken);

    await options.mutationFn({ amount: 5n });
    expect(mockToken.shield).toHaveBeenCalledWith(5n, {});
  });

  test("passes flat callbacks to shield", async ({ mockToken }) => {
    const options = shieldMutationOptions(mockToken);
    const onApprovalSubmitted = () => {};
    const onShieldSubmitted = () => {};

    await options.mutationFn({ amount: 1n, onApprovalSubmitted, onShieldSubmitted });
    expect(mockToken.shield).toHaveBeenCalledWith(1n, {
      onApprovalSubmitted,
      onShieldSubmitted,
    });
  });
});
