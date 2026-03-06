import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "../../test-fixtures";
import { decryptionKeys } from "../decryption-cache";
import { useUserDecrypt } from "../use-user-decrypt";

describe("useUserDecrypt", () => {
  it("delegates to relayer.userDecrypt and populates cache", async ({
    renderWithProviders,
    relayer,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": 200n,
    });

    const { result, queryClient } = renderWithProviders(() => useUserDecrypt());

    result.current.mutate({
      handles: ["0xhandle1", "0xhandle2"],
      contractAddress: "0xtoken" as `0x${string}`,
      signedContractAddresses: ["0xtoken" as `0x${string}`],
      privateKey: "0xpriv",
      publicKey: "0xpub",
      signature: "0xsig",
      signerAddress: "0xuser" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 1,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();

    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(100n);
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle2"))).toBe(200n);
  });
});
