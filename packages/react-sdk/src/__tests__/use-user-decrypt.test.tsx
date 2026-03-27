import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { describe, expect, it, vi } from "../test-fixtures";

describe("useUserDecrypt", () => {
  it("does not fetch by default", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    const handles = [{ handle: "0xh1" as `0x${string}`, contractAddress: tokenAddress }];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), { relayer, signer });

    expect(result.current.fetchStatus).toBe("idle");
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  it("decrypts handles when explicitly enabled", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": 200n,
    });

    const handles = [
      { handle: "0xhandle1" as `0x${string}`, contractAddress: tokenAddress },
      { handle: "0xhandle2" as `0x${string}`, contractAddress: tokenAddress },
    ];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }, { enabled: true }), {
      relayer,
      signer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({
      "0xhandle1": 100n,
      "0xhandle2": 200n,
    });
  });

  it("groups handles by contract address", async ({ relayer, signer, renderWithProviders }) => {
    const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const CONTRACT_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 10n })
      .mockResolvedValueOnce({ "0xh2": 20n });

    const handles = [
      { handle: "0xh1" as `0x${string}`, contractAddress: CONTRACT_A },
      { handle: "0xh2" as `0x${string}`, contractAddress: CONTRACT_B },
    ];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }, { enabled: true }), {
      relayer,
      signer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ "0xh1": 10n, "0xh2": 20n });
  });

  it("deduplicates contract addresses for EIP-712", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xh1": 1n,
      "0xh2": 2n,
    });

    const handles = [
      { handle: "0xh1" as `0x${string}`, contractAddress: tokenAddress },
      { handle: "0xh2" as `0x${string}`, contractAddress: tokenAddress },
    ];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }, { enabled: true }), {
      relayer,
      signer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.createEIP712).toHaveBeenCalledWith(
      "0xpub",
      [tokenAddress],
      expect.any(Number),
      30,
    );
  });

  it("does not fetch when enabled is false", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    const handles = [{ handle: "0xh1" as `0x${string}`, contractAddress: tokenAddress }];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }, { enabled: false }), {
      relayer,
      signer,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  it("does not fetch when handles array is empty", async ({
    relayer,
    signer,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(
      () => useUserDecrypt({ handles: [] }, { enabled: true }),
      { relayer, signer },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  it("reports error when keypair generation fails", async ({ relayer, renderWithProviders }) => {
    vi.mocked(relayer.generateKeypair).mockRejectedValue(new Error("keygen failed"));

    const handles = [
      {
        handle: "0xh" as `0x${string}`,
        contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address,
      },
    ];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }, { enabled: true }), {
      relayer,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "Failed to create decrypt credentials: keygen failed",
    );
  });
});
