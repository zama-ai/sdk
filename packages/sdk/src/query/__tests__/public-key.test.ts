import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import { ZamaSDK } from "../../token/zama-sdk";
import { publicKeyQueryOptions } from "../public-key";

describe("publicKeyQueryOptions", () => {
  test("uses zama.publicKey key and calls relayer", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({
      relayer,
      signer,
      storage,
    });

    const options = publicKeyQueryOptions(sdk);
    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(options.queryKey).toEqual(["zama.publicKey"]);
    expect(result).toEqual({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) });
  });
});
