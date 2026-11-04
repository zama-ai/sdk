import { describe, expect, test } from "../../test-fixtures";

import { encryptMutationOptions } from "../encrypt";
import type { Address } from "viem";

describe("encryptMutationOptions", () => {
  test("encrypts via the SDK mutation", async ({ sdk, relayer, handle, inputProof }) => {
    const options = encryptMutationOptions(sdk);

    expect(options.mutationKey).toEqual(["zama.encrypt"]);
    const params = {
      values: [{ value: 1n, type: "euint64" as const }],
      contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address,
      userAddress: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address,
    };
    const result = await options.mutationFn(params);

    expect(relayer.encryptValues).toHaveBeenCalledWith(expect.objectContaining(params));
    expect(result).toEqual({ encryptedValues: [handle], inputProof });
  });
});
