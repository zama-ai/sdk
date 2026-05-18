import { describe, expect, test } from "../../test-fixtures";
import { publicKeyQueryOptions } from "../public-key";

describe("publicKeyQueryOptions", () => {
  test("uses zama.publicKey key and calls relayer", async ({ sdk, mockQueryContext }) => {
    const options = publicKeyQueryOptions(sdk);
    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(options.queryKey).toEqual(["zama.publicKey"]);
    expect(result).toEqual({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) });
  });
});
