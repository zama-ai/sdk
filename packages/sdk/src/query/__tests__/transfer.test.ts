import { describe, expect, test } from "vitest";
import { confidentialTransferMutationOptions } from "../transfer";
import { createMockToken } from "./test-helpers";

describe("confidentialTransferMutationOptions", () => {
  test("delegates transfer", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = confidentialTransferMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "confidentialTransfer",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({ to: "0x2222222222222222222222222222222222222222", amount: 3n });
    expect(token.confidentialTransfer).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      3n,
    );
  });
});
