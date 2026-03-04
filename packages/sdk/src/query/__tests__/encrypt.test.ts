import { describe, expect, test } from "vitest";
import { ZamaSDK } from "../../token/zama-sdk";
import type { Address } from "../../token/token.types";
import { createMockRelayer, createMockSigner, createMockStorage } from "./test-helpers";
import { encryptMutationOptions } from "../encrypt";

describe("encryptMutationOptions", () => {
  test("delegates sdk.relayer.encrypt", async () => {
    const relayer = createMockRelayer();
    const sdk = new ZamaSDK({ relayer, signer: createMockSigner(), storage: createMockStorage() });
    const options = encryptMutationOptions(sdk);

    expect(options.mutationKey).toEqual(["encrypt"]);
    const params = {
      values: [1n],
      contractAddress: "0x1111111111111111111111111111111111111111" as Address,
      userAddress: "0x2222222222222222222222222222222222222222" as Address,
    };
    await options.mutationFn(params);

    expect(relayer.encrypt).toHaveBeenCalledWith(params);
  });
});
