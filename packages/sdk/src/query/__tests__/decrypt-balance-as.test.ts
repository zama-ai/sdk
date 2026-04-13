import { describe, expect, test } from "../../test-fixtures";
import { decryptBalanceAsMutationOptions } from "../decrypt-balance-as";

describe("decryptBalanceAsMutationOptions", () => {
  test("delegates decryptBalanceAs", async ({ createMockToken }) => {
    const readonlyToken = createMockToken();
    const options = decryptBalanceAsMutationOptions(readonlyToken);

    expect(options.mutationKey).toEqual(["zama.decryptBalanceAs", readonlyToken.address]);
    await options.mutationFn({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    });
    expect(readonlyToken.decryptBalanceAs).toHaveBeenCalledWith({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      owner: undefined,
    });
  });

  test("passes options through", async ({ createMockToken }) => {
    const readonlyToken = createMockToken();
    const options = decryptBalanceAsMutationOptions(readonlyToken);

    await options.mutationFn({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      owner: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    expect(readonlyToken.decryptBalanceAs).toHaveBeenCalledWith({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      owner: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
  });
});
