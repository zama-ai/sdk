import { describe, expect, test } from "../../test-fixtures";
import { confidentialApproveMutationOptions } from "../approve";

describe("confidentialApproveMutationOptions", () => {
  test("delegates approve", async ({ mockToken }) => {
    const options = confidentialApproveMutationOptions(mockToken, mockToken.address);

    expect(options.mutationKey).toEqual(["zama.confidentialApprove", mockToken.address]);
    await options.mutationFn({ spender: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B", until: 123 });
    expect(mockToken.approve).toHaveBeenCalledWith(
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      123,
    );
  });
});
