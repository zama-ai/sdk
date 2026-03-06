import { describe, expect, test } from "../../test-fixtures";
import { shieldETHMutationOptions } from "../shield-eth";

describe("shieldETHMutationOptions", () => {
  test("delegates to token.shieldETH", async ({ mockToken }) => {
    const options = shieldETHMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.shieldETH", mockToken.address]);
    await options.mutationFn({ amount: 1n, value: 2n });
    expect(mockToken.shieldETH).toHaveBeenCalledWith(1n, 2n);
  });
});
