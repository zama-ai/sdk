import type { Address } from "@zama-fhe/sdk";
import { waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAllowed } from "../authorization/use-is-allowed";
import { useZamaSDK } from "../provider";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { describe, expect, it, vi } from "../test-fixtures";

describe("useUserDecrypt", () => {
  it("decrypts handles", async ({ relayer, tokenAddress, renderWithProviders }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });

    const { result } = renderWithProviders(() =>
      useUserDecrypt(
        {
          handles: [
            { handle: "0xhandle1", contractAddress: tokenAddress },
            { handle: "0xhandle2", contractAddress: tokenAddress },
          ],
        },
        { enabled: true },
      ),
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
      useUserDecrypt(
        {
          handles: [
            { handle: "0xh1", contractAddress: CONTRACT_A },
            { handle: "0xh2", contractAddress: CONTRACT_B },
          ],
        },
        { enabled: true },
      ),
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
      useUserDecrypt(
        { handles: [{ handle: "0xh", contractAddress: tokenAddress }] },
        { enabled: true },
      ),
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

  it("is off by default — no signature prompt when enabled is not provided", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() =>
      useUserDecrypt({ handles: [{ handle: "0xh", contractAddress: tokenAddress }] }),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("gated on useIsAllowed=true fires and decrypts silently without a wallet prompt", async ({
    signer,
    relayer,
    tokenAddress,
    renderWithProviders,
  }) => {
    // SDK-80 row 17: when credentials are already authorized for the contract,
    // useIsAllowed resolves to true and useUserDecrypt fires automatically —
    // no extra signature prompt should be triggered by the decrypt itself.
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xh": 42n });

    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const queryClient = useQueryClient();
      // Prime credentials once on mount so isAllowed flips to true,
      // then invalidate so the cached `false` result is re-fetched.
      useEffect(() => {
        void sdk.credentials.allow(tokenAddress).then(() =>
          queryClient.invalidateQueries({
            queryKey: zamaQueryKeys.isAllowed.all,
          }),
        );
      }, [sdk, queryClient]);

      const isAllowed = useIsAllowed({ contractAddresses: [tokenAddress] });
      const decrypt = useUserDecrypt(
        { handles: [{ handle: "0xh", contractAddress: tokenAddress }] },
        { enabled: isAllowed.data === true },
      );
      return { isAllowed, decrypt };
    });

    await waitFor(() => expect(result.current.isAllowed.data).toBe(true));
    await waitFor(() => expect(result.current.decrypt.isSuccess).toBe(true), {
      timeout: 5_000,
    });

    expect(result.current.decrypt.data).toEqual({ "0xh": 42n });
    // Exactly one signature: the credential priming. The decrypt itself must
    // not have prompted an additional signature.
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
  });

  it("gated on useIsAllowed=false does not prompt for a signature", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    // SDK-42 pattern: the consumer gates the decrypt hook on useIsAllowed.
    // When no session exists, isAllowed resolves to false and decrypt must
    // stay idle — no EIP-712 prompt on mount.
    const { result } = renderWithProviders(() => {
      const isAllowed = useIsAllowed({ contractAddresses: [tokenAddress] });
      const decrypt = useUserDecrypt(
        { handles: [{ handle: "0xh", contractAddress: tokenAddress }] },
        { enabled: isAllowed.data === true },
      );
      return { isAllowed, decrypt };
    });

    await waitFor(() => expect(result.current.isAllowed.data).toBe(false));
    await waitFor(() => expect(result.current.decrypt.fetchStatus).toBe("idle"));

    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(result.current.decrypt.data).toBeUndefined();
  });
});
