import { describe, expect, test } from "vitest";
import { unshieldAllMutationOptions } from "../unshield-all";
import { createMockToken } from "./test-helpers";

describe("unshieldAllMutationOptions", () => {
  test("delegates unshieldAll", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = unshieldAllMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "unshieldAll",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn(undefined);
    expect(token.unshieldAll).toHaveBeenCalledWith(undefined);
  });
});
