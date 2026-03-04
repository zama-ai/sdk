import { describe, expect, test } from "vitest";
import { approveUnderlyingMutationOptions } from "../approve-underlying";
import { createMockToken } from "./test-helpers";

describe("approveUnderlyingMutationOptions", () => {
  test("delegates approveUnderlying", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = approveUnderlyingMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "approveUnderlying",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({ amount: 9n });
    expect(token.approveUnderlying).toHaveBeenCalledWith(9n);
  });
});
