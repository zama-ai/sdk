import { waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useDecryptPublicValues } from "../use-public-decrypt";

describe("useDecryptPublicValues", () => {
  test("delegates to relayer.decryptPublicValues and populates cache", async ({
    renderWithProviders,
    relayer,
  }) => {
    vi.mocked(relayer.decryptPublicValues).mockResolvedValue({
      clearValues: { "0xhandle1": 500n },
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    });

    const { result, queryClient } = renderWithProviders(() => useDecryptPublicValues());

    result.current.mutate(["0xhandle1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.decryptPublicValues).toHaveBeenCalledWith(["0xhandle1"]);

    expect(queryClient.getQueryData(zamaQueryKeys.decryption.encryptedValue("0xhandle1"))).toBe(
      500n,
    );
  });
});
