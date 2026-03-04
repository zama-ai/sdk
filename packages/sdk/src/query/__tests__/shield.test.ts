import { describe, expect, test } from "vitest";
import { shieldMutationOptions } from "../shield";
import { createMockToken } from "./test-helpers";

describe("shieldMutationOptions", () => {
  test("creates key and delegates mutationFn", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = shieldMutationOptions(token);

    expect(options.mutationKey).toEqual(["shield", "0x1111111111111111111111111111111111111111"]);
    await options.mutationFn({ amount: 1n, fees: 2n, approvalStrategy: "exact" });
    expect(token.shield).toHaveBeenCalledWith(1n, { fees: 2n, approvalStrategy: "exact" });
  });

  test("passes undefined optional shield params", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = shieldMutationOptions(token);

    await options.mutationFn({ amount: 5n });
    expect(token.shield).toHaveBeenCalledWith(5n, {
      fees: undefined,
      approvalStrategy: undefined,
    });
  });
});
