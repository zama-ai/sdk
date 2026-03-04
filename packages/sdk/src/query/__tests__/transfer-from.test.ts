import { describe, expect, test } from "vitest";
import { confidentialTransferFromMutationOptions } from "../transfer-from";
import { createMockToken } from "./test-helpers";

describe("confidentialTransferFromMutationOptions", () => {
  test("delegates transferFrom", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = confidentialTransferFromMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "confidentialTransferFrom",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({
      from: "0x2222222222222222222222222222222222222222",
      to: "0x3333333333333333333333333333333333333333",
      amount: 4n,
    });
    expect(token.confidentialTransferFrom).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      4n,
    );
  });
});
