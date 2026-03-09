import { describe, expect, test } from "../../test-fixtures";
import { decryptBalanceAsMutationOptions } from "../decrypt-balance-as";

describe("decryptBalanceAsMutationOptions", () => {
  test("delegates decryptBalanceAs", async ({ createMockReadonlyToken }) => {
    const readonlyToken = createMockReadonlyToken();
    const options = decryptBalanceAsMutationOptions(readonlyToken);

    expect(options.mutationKey).toEqual(["zama.decryptBalanceAs", readonlyToken.address]);
    await options.mutationFn({
      delegator: "0x2222222222222222222222222222222222222222",
    });
    expect(readonlyToken.decryptBalanceAs).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      undefined,
    );
  });

  test("passes options through", async ({ createMockReadonlyToken }) => {
    const readonlyToken = createMockReadonlyToken();
    const options = decryptBalanceAsMutationOptions(readonlyToken);

    await options.mutationFn({
      delegator: "0x2222222222222222222222222222222222222222",
      options: { owner: "0x3333333333333333333333333333333333333333" },
    });
    expect(readonlyToken.decryptBalanceAs).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      { owner: "0x3333333333333333333333333333333333333333" },
    );
  });
});
