import { describe, expect, test } from "../../test-fixtures";
import { unshieldAllMutationOptions } from "../unshield-all";

describe("unshieldAllMutationOptions", () => {
  test("delegates unshieldAll", async ({ mockToken }) => {
    const options = unshieldAllMutationOptions(mockToken);

    expect(options.mutationKey).toEqual(["zama.unshieldAll", mockToken.address]);
    await options.mutationFn(undefined);
    expect(mockToken.unshieldAll).toHaveBeenCalledWith(undefined);
  });
});
