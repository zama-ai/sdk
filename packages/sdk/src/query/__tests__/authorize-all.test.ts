import { describe, expect, test, vi } from "vitest";
import { ReadonlyToken } from "../../token/readonly-token";
import { ZamaSDK } from "../../token/zama-sdk";
import { createMockRelayer, createMockSigner, createMockStorage } from "./test-helpers";
import { authorizeAllMutationOptions } from "../authorize-all";

describe("authorizeAllMutationOptions", () => {
  test("creates readonly tokens and calls ReadonlyToken.authorizeAll", async () => {
    const relayer = createMockRelayer();
    const sdk = new ZamaSDK({ relayer, signer: createMockSigner(), storage: createMockStorage() });
    const authorizeSpy = vi.spyOn(ReadonlyToken, "authorizeAll").mockResolvedValue(undefined);

    const options = authorizeAllMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["authorizeAll"]);

    await options.mutationFn({
      tokenAddresses: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ],
    });

    expect(authorizeSpy).toHaveBeenCalledTimes(1);
    expect(authorizeSpy.mock.calls[0]?.[0]).toHaveLength(2);
  });
});
