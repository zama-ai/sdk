import { describe, expect, test } from "../../test-fixtures";
import { ZamaSDK } from "../../token/zama-sdk";
import type { Address } from "../../token/token.types";
import { encryptMutationOptions } from "../encrypt";

describe("encryptMutationOptions", () => {
  test("delegates sdk.relayer.encrypt", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const options = encryptMutationOptions(sdk);

    expect(options.mutationKey).toEqual(["zama.encrypt"]);
    const params = {
      values: [{ value: 1n, type: "euint64" as const }],
      contractAddress: "0x1111111111111111111111111111111111111111" as Address,
      userAddress: "0x2222222222222222222222222222222222222222" as Address,
    };
    await options.mutationFn(params);

    expect(relayer.encrypt).toHaveBeenCalledWith(params);
  });
});
