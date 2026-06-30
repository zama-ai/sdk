import { describe, expect, test } from "../../test-fixtures";
import { shieldMutationOptions } from "../shield";

describe("shieldMutationOptions", () => {
  test("creates key and delegates mutationFn", async ({ mockWrappedToken }) => {
    const options = shieldMutationOptions(mockWrappedToken);

    expect(options.mutationKey).toEqual(["zama.shield", mockWrappedToken.address]);
    await options.mutationFn({ amount: 1n, approvalStrategy: "exact" });
    expect(mockWrappedToken.shield).toHaveBeenCalledWith(1n, { approvalStrategy: "exact" });
  });

  test("passes undefined optional shield params", async ({ mockWrappedToken }) => {
    const options = shieldMutationOptions(mockWrappedToken);

    await options.mutationFn({ amount: 5n });
    expect(mockWrappedToken.shield).toHaveBeenCalledWith(5n, {});
  });

  test("passes flat callbacks to shield", async ({ mockWrappedToken }) => {
    const options = shieldMutationOptions(mockWrappedToken);
    const onApprovalSubmitted = () => {};
    const onShieldSubmitted = () => {};

    await options.mutationFn({ amount: 1n, onApprovalSubmitted, onShieldSubmitted });
    expect(mockWrappedToken.shield).toHaveBeenCalledWith(1n, {
      onApprovalSubmitted,
      onShieldSubmitted,
    });
  });
});
