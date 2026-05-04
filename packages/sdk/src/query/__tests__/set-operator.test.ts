import { describe, expect, test } from "../../test-fixtures";
import { confidentialSetOperatorMutationOptions } from "../set-operator";

describe("confidentialSetOperatorMutationOptions", () => {
  test("delegates setOperator", async ({ mockToken }) => {
    const options = confidentialSetOperatorMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.confidentialSetOperator", mockToken.address]);
    await options.mutationFn({
      operator: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      until: 123,
    });
    expect(mockToken.setOperator).toHaveBeenCalledWith(
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      123,
    );
  });
});
