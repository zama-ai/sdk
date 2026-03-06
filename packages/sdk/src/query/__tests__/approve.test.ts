import { describe, expect, test } from "../../test-fixtures";
import { confidentialApproveMutationOptions } from "../approve";

describe("confidentialApproveMutationOptions", () => {
  test("delegates approve", async ({ mockToken }) => {
    const options = confidentialApproveMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.confidentialApprove", mockToken.address]);
    await options.mutationFn({ spender: "0x2222222222222222222222222222222222222222", until: 123 });
    expect(mockToken.approve).toHaveBeenCalledWith(
      "0x2222222222222222222222222222222222222222",
      123,
    );
  });
});
