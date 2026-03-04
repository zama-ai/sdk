import { describe, expect, test } from "vitest";
import { shieldETHMutationOptions } from "../shield-eth";
import { createMockToken } from "./test-helpers";

describe("shieldETHMutationOptions", () => {
  test("delegates to token.shieldETH", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = shieldETHMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "shieldETH",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({ amount: 1n, value: 2n });
    expect(token.shieldETH).toHaveBeenCalledWith(1n, 2n);
  });
});
