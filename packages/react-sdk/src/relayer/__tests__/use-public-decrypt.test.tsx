import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "../../test-fixtures";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { usePublicDecrypt } from "../use-public-decrypt";
import { ZamaSDK, type Handle } from "@zama-fhe/sdk";

const HANDLE = ("0x" + "aa".repeat(32)) as Handle;

describe("usePublicDecrypt", () => {
  it("delegates to sdk.publicDecrypt and populates cache", async ({ renderWithProviders }) => {
    const publicDecrypt = vi.spyOn(ZamaSDK.prototype, "publicDecrypt").mockResolvedValue({
      clearValues: { [HANDLE]: 500n },
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    });

    const { result, queryClient } = renderWithProviders(() => usePublicDecrypt());

    result.current.mutate([HANDLE]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(publicDecrypt).toHaveBeenCalledWith([HANDLE]);

    expect(queryClient.getQueryData(zamaQueryKeys.decryption.handle(HANDLE))).toBe(500n);
  });
});
