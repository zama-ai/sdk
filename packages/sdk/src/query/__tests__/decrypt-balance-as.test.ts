import { describe, expect, test } from "../../test-fixtures";
import { decryptBalanceAsMutationOptions } from "../decrypt-balance-as";

describe("decryptBalanceAsMutationOptions", () => {
  test("delegates decryptBalanceAs", async ({ createMockToken }) => {
    const token = createMockToken();
    const options = decryptBalanceAsMutationOptions(token);

    expect(options.mutationKey).toEqual(["zama.decryptBalanceAs", token.address]);
    await options.mutationFn({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    });
    expect(token.decryptBalanceAs).toHaveBeenCalledWith({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      owner: undefined,
    });
  });

  test("passes options through", async ({ createMockToken }) => {
    const token = createMockToken();
    const options = decryptBalanceAsMutationOptions(token);

    await options.mutationFn({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      owner: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    expect(token.decryptBalanceAs).toHaveBeenCalledWith({
      delegatorAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      owner: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
  });
});
