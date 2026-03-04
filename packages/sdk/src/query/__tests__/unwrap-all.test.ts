import { describe, expect, test } from "vitest";
import { unwrapAllMutationOptions } from "../unwrap-all";
import { createMockToken } from "./test-helpers";

describe("unwrapAllMutationOptions", () => {
  test("delegates unwrapAll", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = unwrapAllMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "unwrapAll",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn();
    expect(token.unwrapAll).toHaveBeenCalled();
  });
});
