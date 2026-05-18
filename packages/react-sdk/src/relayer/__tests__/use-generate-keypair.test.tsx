import { waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useGenerateKeypair } from "../use-generate-keypair";

describe("useGenerateKeypair", () => {
  test("delegates to relayer.generateKeypair", async ({ renderWithProviders, relayer }) => {
    const { result } = renderWithProviders(() => useGenerateKeypair());

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);

    await waitFor(() => expect(relayer.generateKeypair).toHaveBeenCalledOnce());
    vi.mocked(relayer.generateKeypair).mockClear();
    vi.mocked(relayer.generateKeypair).mockResolvedValueOnce({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    });
  });
});
