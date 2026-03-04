import { describe, expect, test } from "vitest";
import { ZamaSDK } from "../../token/zama-sdk";
import { createMockRelayer, createMockSigner, createMockStorage } from "./test-helpers";
import { publicKeyQueryOptions } from "../public-key";

describe("publicKeyQueryOptions", () => {
  test("uses zama.publicKey key and calls relayer", async () => {
    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: createMockSigner(),
      storage: createMockStorage(),
    });

    const options = publicKeyQueryOptions(sdk);
    const result = await options.queryFn({ queryKey: options.queryKey });

    expect(options.queryKey).toEqual(["zama.publicKey"]);
    expect(result).toEqual({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) });
  });
});
