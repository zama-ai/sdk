import type { Address, DecryptValuesParameters, TypedValue } from "@zama-fhe/sdk";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useConfidentialBalance } from "../use-confidential-balance";

describe("useConfidentialBalance", () => {
  test("default", async ({ renderWithProviders, relayer, provider, tokenAddress, userAddress }) => {
    const handle = `0x${"aa".repeat(32)}`;
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 123n } as TypedValue,
    ]);

    const { result } = renderWithProviders(() =>
      useConfidentialBalance({ address: tokenAddress, account: userAddress }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(result.current.data).toBe(123n);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "confidentialBalanceOf", address: tokenAddress }),
    );
  });

  test("behavior: disabled when user passes enabled=false", async ({
    renderWithProviders,
    provider,
    tokenAddress,
    userAddress,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialBalance({ address: tokenAddress, account: userAddress }, { enabled: false }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("behavior: disabled when account is undefined (signer-less mount)", ({
    renderWithProviders,
    provider,
    tokenAddress,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialBalance({ address: tokenAddress, account: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("behavior: uses the caller-supplied account even when it differs from the connected signer", async ({
    renderWithProviders,
    relayer,
    provider,
    tokenAddress,
  }) => {
    const handle = `0x${"cd".repeat(32)}`;
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 456n } as TypedValue,
    ]);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useConfidentialBalance({ address: tokenAddress, account: OTHER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
    expect(result.current.data).toBe(456n);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "confidentialBalanceOf", args: [OTHER] }),
    );
  });

  describe("lifecycle", () => {
    test("default", async ({
      renderWithProviders,
      relayer,
      provider,
      tokenAddress,
      userAddress,
    }) => {
      const handle = `0x${"aa".repeat(32)}`;
      vi.mocked(provider.readContract).mockResolvedValue(handle);
      vi.mocked(relayer.decryptValues).mockResolvedValue([
        { type: "uint64", value: 123n } as TypedValue,
      ]);

      const { result } = renderWithProviders(() =>
        useConfidentialBalance({ address: tokenAddress, account: userAddress }),
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

      const { data, dataUpdatedAt, ...stableState } = result.current;
      expect(data).toBe(123n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
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

    test("behavior: balance updates on refetch when handle changes", async ({
      renderWithProviders,
      relayer,
      provider,
      tokenAddress,
      userAddress,
    }) => {
      const handleA = `0x${"ab".repeat(32)}`;
      const handleB = `0x${"bc".repeat(32)}`;
      let currentHandle: string = handleA;
      vi.mocked(provider.readContract).mockImplementation(async () => currentHandle);
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ encryptedValues }: DecryptValuesParameters) => {
          const value = encryptedValues[0] === handleA ? 111n : 222n;
          return [{ type: "uint64", value } as TypedValue];
        },
      );

      const { result } = renderWithProviders(() =>
        useConfidentialBalance({ address: tokenAddress, account: userAddress }),
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
      expect(result.current.data).toBe(111n);

      currentHandle = handleB;
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => expect(result.current.data).toBe(222n), { timeout: 5_000 });
      expect(relayer.decryptValues).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ encryptedValues: [handleA] }),
      );
      expect(relayer.decryptValues).toHaveBeenLastCalledWith(
        expect.objectContaining({ encryptedValues: [handleB] }),
      );
    });

    test("behavior: re-render preserves cached data", async ({
      renderWithProviders,
      relayer,
      provider,
      tokenAddress,
      userAddress,
    }) => {
      const handle = `0x${"ad".repeat(32)}`;
      vi.mocked(provider.readContract).mockResolvedValue(handle);
      vi.mocked(relayer.decryptValues).mockResolvedValue([
        { type: "uint64", value: 999n } as TypedValue,
      ]);

      const { result, rerender } = renderWithProviders(() =>
        useConfidentialBalance({ address: tokenAddress, account: userAddress }),
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
      const firstData = result.current.data;

      rerender();

      expect(result.current.data).toBe(firstData);
    });

    test("behavior: disabled when user passes enabled=false", async ({
      renderWithProviders,
      provider,
      tokenAddress,
      userAddress,
    }) => {
      const { result } = renderWithProviders(() =>
        useConfidentialBalance({ address: tokenAddress, account: userAddress }, { enabled: false }),
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(provider.readContract).not.toHaveBeenCalled();
    });
  });
});
