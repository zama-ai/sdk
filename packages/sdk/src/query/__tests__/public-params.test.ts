import { describe, expect, test } from "vitest";
import { ZamaSDK } from "../../token/zama-sdk";
import { createMockRelayer, createMockSigner, createMockStorage } from "./test-helpers";
import { publicParamsQueryOptions } from "../public-params";

describe("publicParamsQueryOptions", () => {
  test("uses key bits and calls relayer.getPublicParams", async () => {
    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: createMockSigner(),
      storage: createMockStorage(),
    });

    const options = publicParamsQueryOptions(sdk, 2048);
    const result = await options.queryFn({ queryKey: options.queryKey });

    expect(options.queryKey).toEqual(["zama.publicParams", { bits: 2048 }]);
    expect(result).toEqual({ publicParamsId: "pp-1", publicParams: new Uint8Array([2]) });
  });
});
