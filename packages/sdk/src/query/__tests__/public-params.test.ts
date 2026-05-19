import { describe, expect, test } from "../../test-fixtures";
import { publicParamsQueryOptions } from "../public-params";

describe("publicParamsQueryOptions", () => {
  test("uses key bits and calls relayer.getPublicParams", async ({ sdk, mockQueryContext }) => {
    const options = publicParamsQueryOptions(sdk, 2048);
    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(options.queryKey).toEqual(["zama.publicParams", { bits: 2048 }]);
    expect(result).toEqual({ publicParamsId: "pp-1", publicParams: new Uint8Array([2]) });
  });
});
