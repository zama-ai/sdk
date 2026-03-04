import { describe, expect, test } from "vitest";
import { createMockSigner } from "./test-helpers";
import { signerAddressQueryOptions } from "../signer-address";

describe("signerAddressQueryOptions", () => {
  test("returns query key and reads signer address", async () => {
    const signer = createMockSigner();
    const options = signerAddressQueryOptions(signer, "0x1111111111111111111111111111111111111111");

    expect(options.queryKey).toEqual([
      "zama.signerAddress",
      { tokenAddress: "0x1111111111111111111111111111111111111111" },
    ]);

    await options.queryFn({ queryKey: options.queryKey });
    expect(signer.getAddress).toHaveBeenCalled();
  });
});
