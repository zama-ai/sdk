import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import { signerAddressQueryOptions } from "../signer-address";

describe("signerAddressQueryOptions", () => {
  test("returns query key and reads signer address", async ({ sdk, signer }) => {
    const options = signerAddressQueryOptions(sdk);

    expect(options.queryKey).toEqual(["zama.signerAddress", { scope: expect.any(Number) }]);

    await options.queryFn(mockQueryContext(options.queryKey));
    expect(signer.getAddress).toHaveBeenCalled();
  });

  test("uses a stable scope per sdk instance", ({
    sdk,
    createSDK,
    createMockSigner,
    createMockProvider,
  }) => {
    const otherSigner = createMockSigner();
    const otherSdk = createSDK({ signer: otherSigner, provider: createMockProvider(otherSigner) });

    expect(signerAddressQueryOptions(sdk).queryKey).toEqual(
      signerAddressQueryOptions(sdk).queryKey,
    );
    expect(signerAddressQueryOptions(sdk).queryKey).not.toEqual(
      signerAddressQueryOptions(otherSdk).queryKey,
    );
  });
});
