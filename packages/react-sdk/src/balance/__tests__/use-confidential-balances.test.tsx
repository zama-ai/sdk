import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useConfidentialBalances } from "../use-confidential-balances";
import { TOKEN, TOKEN_B, USER } from "../../__tests__/mutation-test-helpers";

describe("useConfidentialBalances", () => {
  test("default", async ({ renderWithProviders, relayer, provider }) => {
    const handleA = `0x${"bb".repeat(32)}`;
    const handleB = `0x${"cc".repeat(32)}`;
    vi.mocked(provider.readContract).mockImplementation(async ({ address }) => {
      if (address === TOKEN) {
        return handleA;
      }
      if (address === TOKEN_B) {
        return handleB;
      }
      throw new Error(`Unexpected readContract address ${address}`);
    });
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      [handleA]: 10n,
      [handleB]: 20n,
    });

    const { result } = renderWithProviders(() =>
      useConfidentialBalances({ tokenAddresses: [TOKEN, TOKEN_B] }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(result.current.data?.results.get(TOKEN)).toBe(10n);
    expect(result.current.data?.results.get(TOKEN_B)).toBe(20n);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "confidentialBalanceOf", address: TOKEN }),
    );
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "confidentialBalanceOf", address: TOKEN_B }),
    );
  });

  test("preserves the caller token address casing in result maps", async ({
    renderWithProviders,
    relayer,
    provider,
  }) => {
    const mixedCaseToken = "0x52908400098527886E0F7030069857D2E4169EE7" as Address;
    const handle = `0x${"dd".repeat(32)}`;

    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 33n });

    const { result } = renderWithProviders(() =>
      useConfidentialBalances({ tokenAddresses: [mixedCaseToken] }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(result.current.data?.results.get(mixedCaseToken)).toBe(33n);
  });

  test("behavior: disabled when user passes enabled=false", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialBalances({ tokenAddresses: [TOKEN, TOKEN_B] }, { enabled: false }),
    );

    await waitFor(() => expect(signer.getAddress).toHaveBeenCalled(), { timeout: 5_000 });
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  describe("lifecycle", () => {
    test("default", async ({ renderWithProviders, relayer, provider }) => {
      const handleA = `0x${"ca".repeat(32)}`;
      const handleB = `0x${"cb".repeat(32)}`;
      vi.mocked(provider.readContract).mockImplementation(async ({ address }) => {
        if (address === TOKEN) {
          return handleA;
        }
        if (address === TOKEN_B) {
          return handleB;
        }
        throw new Error(`Unexpected readContract address ${address}`);
      });
      vi.mocked(relayer.userDecrypt).mockResolvedValue({
        [handleA]: 10n,
        [handleB]: 20n,
      });

      const tokens = [TOKEN, TOKEN_B];
      const { result } = renderWithProviders(() =>
        useConfidentialBalances({ tokenAddresses: tokens }),
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

      const { data, dataUpdatedAt, ...state } = result.current;
      const { promise: statePromise, ...stableState } = state;
      expect(data?.results.get(TOKEN)).toBe(10n);
      expect(data?.results.get(TOKEN_B)).toBe(20n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(statePromise).toBeDefined();
      expect(stableState).toMatchInlineSnapshot(`
      {
        "error": null,
        "errorUpdateCount": 0,
        "errorUpdatedAt": 0,
        "failureCount": 0,
        "failureReason": null,
        "fetchStatus": "idle",
        "isEnabled": true,
        "isError": false,
        "isFetched": true,
        "isFetchedAfterMount": true,
        "isFetching": false,
        "isInitialLoading": false,
        "isLoading": false,
        "isLoadingError": false,
        "isPaused": false,
        "isPending": false,
        "isPlaceholderData": false,
        "isRefetchError": false,
        "isRefetching": false,
        "isStale": true,
        "isSuccess": true,
        "refetch": [Function],
        "status": "success",
      }
    `);
    });

    test("behavior: disabled when tokenAddresses empty", ({ renderWithProviders }) => {
      const { result } = renderWithProviders(() => useConfidentialBalances({ tokenAddresses: [] }));

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("behavior: query stays disabled when signer.getAddress rejects", async ({
      renderWithProviders,
      signer,
    }) => {
      // When signer.getAddress() rejects, ZamaProvider swallows the error in
      // its useEffect and signerAddress stays undefined.  The balances query is
      // gated on signerAddress !== undefined, so it must remain pending/idle
      // rather than entering an error state.
      vi.mocked(signer.getAddress).mockRejectedValue(new Error("disconnected"));

      const { result } = renderWithProviders(() =>
        useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      );

      // Give React time to run the effect
      await waitFor(() => expect(signer.getAddress).toHaveBeenCalled());

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.data).toBeUndefined();
    });

    test("behavior: signer undefined -> defined", async ({
      renderWithProviders,
      signer,
      relayer,
      provider,
    }) => {
      const handle = `0x${"cc".repeat(32)}`;
      let resolveAddress: (value: Address) => void;
      const addressPromise = new Promise<Address>((resolve) => {
        resolveAddress = resolve;
      });

      vi.mocked(signer.getAddress).mockReturnValue(addressPromise);
      vi.mocked(provider.readContract).mockResolvedValue(handle);
      vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 456n });

      const { result, rerender } = renderWithProviders(() =>
        useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      );

      expect(result.current.isPending).toBe(true);

      resolveAddress!(USER);
      rerender();

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
      expect(result.current.data?.results.get(TOKEN)).toBe(456n);
    });

    test("behavior: disabled when user passes enabled=false", async ({ renderWithProviders }) => {
      const { result } = renderWithProviders(() =>
        useConfidentialBalances({ tokenAddresses: [TOKEN, TOKEN_B] }, { enabled: false }),
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
    });
  });
});
