import { describe, expect, test } from "vitest";
import { unwrapMutationOptions } from "../unwrap";
import { createMockToken } from "./test-helpers";

describe("unwrapMutationOptions", () => {
  test("delegates unwrap", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = unwrapMutationOptions(token);

    expect(options.mutationKey).toEqual(["unwrap", "0x1111111111111111111111111111111111111111"]);
    await options.mutationFn({ amount: 12n });
    expect(token.unwrap).toHaveBeenCalledWith(12n);
  });
});
