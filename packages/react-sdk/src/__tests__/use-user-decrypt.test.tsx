import type { Address } from "@zama-fhe/sdk";
import { waitFor } from "@testing-library/react";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { describe, expect, it, vi } from "../test-fixtures";

describe("useUserDecrypt", () => {
  it("decrypts handles", async ({ relayer, tokenAddress, renderWithProviders }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });

    const { result } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [
          { handle: "0xhandle1", contractAddress: tokenAddress },
          { handle: "0xhandle2", contractAddress: tokenAddress },
        ],
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 5_000,
    });

    expect(result.current.data).toEqual({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });
  });

  it("groups handles by contract address", async ({ relayer, renderWithProviders }) => {
    const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const CONTRACT_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 10n })
      .mockResolvedValueOnce({ "0xh2": 20n });

    const { result } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [
          { handle: "0xh1", contractAddress: CONTRACT_A },
          { handle: "0xh2", contractAddress: CONTRACT_B },
        ],
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 5_000,
    });

    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ "0xh1": 10n, "0xh2": 20n });
  });

  it("reports error when keypair generation fails", async ({
    relayer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.generateKeypair).mockRejectedValue(new Error("keygen failed"));

    const { result } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [{ handle: "0xh", contractAddress: tokenAddress }],
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5_000,
    });
    expect(result.current.error?.message).toBe(
      "Failed to create decrypt credentials: keygen failed",
    );
  });

  it("respects enabled = false", async ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useUserDecrypt(
        { handles: [{ handle: "0xh", contractAddress: tokenAddress }] },
        { enabled: false },
      ),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });

  it("stays disabled with empty handles", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUserDecrypt({ handles: [] }));

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });
});
