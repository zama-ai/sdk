import { describe, expect, test } from "vitest";
import { confidentialApproveMutationOptions } from "../approve";
import { createMockToken } from "./test-helpers";

describe("confidentialApproveMutationOptions", () => {
  test("delegates approve", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = confidentialApproveMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "confidentialApprove",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({ spender: "0x2222222222222222222222222222222222222222", until: 123 });
    expect(token.approve).toHaveBeenCalledWith("0x2222222222222222222222222222222222222222", 123);
  });
});
