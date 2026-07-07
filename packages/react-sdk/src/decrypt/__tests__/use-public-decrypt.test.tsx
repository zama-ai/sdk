import { waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useDecryptPublicValues } from "../use-public-decrypt";

describe("useDecryptPublicValues", () => {
  test("delegates to relayer.decryptPublicValuesWithSignatures and populates cache", async ({
    renderWithProviders,
    relayer,
  }) => {
    vi.mocked(relayer.decryptPublicValuesWithSignatures).mockResolvedValue({
      clearValues: [{ type: "uint64", value: 500n }],
      checkSignaturesArgs: {
        handlesList: ["0xhandle1"],
        abiEncodedCleartexts: "0x",
        decryptionProof: "0xproof",
      },
    } as any);

    const { result, queryClient } = renderWithProviders(() => useDecryptPublicValues());

    result.current.mutate(["0xhandle1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.decryptPublicValuesWithSignatures).toHaveBeenCalledWith({
      encryptedValues: ["0xhandle1"],
    });

    expect(queryClient.getQueryData(zamaQueryKeys.decryption.encryptedValue("0xhandle1"))).toBe(
      500n,
    );
  });
});
