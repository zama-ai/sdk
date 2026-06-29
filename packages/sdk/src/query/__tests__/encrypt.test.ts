import { describe, expect, test, vi } from "../../test-fixtures";

import { encryptMutationOptions } from "../encrypt";
import type { Address } from "viem";

describe("encryptMutationOptions", () => {
  test("encrypts via the SDK mutation", async ({ sdk, handle, inputProof }) => {
    const options = encryptMutationOptions(sdk);

    expect(options.mutationKey).toEqual(["zama.encrypt"]);
    const params = {
      values: [{ value: 1n, type: "euint64" as const }],
      contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address,
      userAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address,
    };
    const encrypt = vi.spyOn(sdk, "encrypt");
    const result = await options.mutationFn(params);

    expect(encrypt).toHaveBeenCalledWith(params);
    expect(result).toEqual({ encryptedValues: [handle], inputProof });
  });
});
