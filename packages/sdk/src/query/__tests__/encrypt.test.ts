import { describe, expect, test } from "../../test-fixtures";
import { ZamaSDK } from "../../zama-sdk";

import { encryptMutationOptions } from "../encrypt";
import type { Address } from "viem";

describe("encryptMutationOptions", () => {
  test("delegates sdk.relayer.encrypt", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const options = encryptMutationOptions(sdk);

    expect(options.mutationKey).toEqual(["zama.encrypt"]);
    const params = {
      values: [{ value: 1n, type: "euint64" as const }],
      contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address,
      userAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address,
    };
    await options.mutationFn(params);

    expect(relayer.encrypt).toHaveBeenCalledWith(params);
  });
});
