import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import { signerAddressQueryOptions } from "../signer-address";

describe("signerAddressQueryOptions", () => {
  test("returns query key and reads signer address", async ({ signer }) => {
    const options = signerAddressQueryOptions(signer);

    expect(options.queryKey).toEqual(["zama.signerAddress", { scope: expect.any(Number) }]);

    await options.queryFn(mockQueryContext(options.queryKey));
    expect(signer.getAddress).toHaveBeenCalled();
  });

  test("uses a stable scope per signer instance", ({ signer, createMockSigner }) => {
    const otherSigner = createMockSigner();

    expect(signerAddressQueryOptions(signer).queryKey).toEqual(
      signerAddressQueryOptions(signer).queryKey,
    );
    expect(signerAddressQueryOptions(signer).queryKey).not.toEqual(
      signerAddressQueryOptions(otherSigner).queryKey,
    );
  });
});
