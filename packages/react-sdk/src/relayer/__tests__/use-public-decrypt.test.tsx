import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "../../test-fixtures";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { usePublicDecrypt } from "../use-public-decrypt";

describe("usePublicDecrypt", () => {
  it("delegates to relayer.publicDecrypt and populates cache", async ({
    renderWithProviders,
    relayer,
  }) => {
    vi.mocked(relayer.publicDecrypt).mockResolvedValue({
      clearValues: { "0xhandle1": 500n },
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    });

    const { result, queryClient } = renderWithProviders(() => usePublicDecrypt());

    result.current.mutate(["0xhandle1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.publicDecrypt).toHaveBeenCalledWith(["0xhandle1"]);

    expect(queryClient.getQueryData(zamaQueryKeys.decryption.handle("0xhandle1"))).toBe(500n);
  });
});
