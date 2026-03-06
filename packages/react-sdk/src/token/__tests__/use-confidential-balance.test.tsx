import { describe, expect, test, vi } from "../../test-fixtures";
import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useConfidentialBalance } from "../use-confidential-balance";
import { TOKEN, USER } from "../../__tests__/mutation-test-helpers";

describe("useConfidentialBalance", () => {
  test("default", async ({ renderWithProviders, signer, relayer }) => {
    const handle = `0x${"aa".repeat(32)}` as Address;
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 123n });

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(result.current.data).toBe(123n);
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "confidentialBalanceOf", address: TOKEN }),
    );
  });

  test("behavior: disabled when user passes enabled=false", async ({
    renderWithProviders,
    signer,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialBalance({ tokenAddress: TOKEN }, { enabled: false }),
    );

    await waitFor(() => expect(signer.getAddress).toHaveBeenCalled(), { timeout: 5_000 });
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handleQuery.fetchStatus).toBe("idle");
    expect(signer.readContract).not.toHaveBeenCalled();
  });

  test("behavior: disables both phases for other falsy enabled values", async ({
    renderWithProviders,
    signer,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialBalance({ tokenAddress: TOKEN }, { enabled: 0 as unknown as boolean }),
    );

    await waitFor(() => expect(signer.getAddress).toHaveBeenCalled(), { timeout: 5_000 });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handleQuery.fetchStatus).toBe("idle");
    expect(signer.readContract).not.toHaveBeenCalled();
  });

  describe("lifecycle", () => {
    test("default", async ({ renderWithProviders, signer, relayer }) => {
      const handle = `0x${"aa".repeat(32)}` as Address;
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 123n });

      const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }));

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

      const { data, dataUpdatedAt, handleQuery, ...state } = result.current;
      const { data: handleData, dataUpdatedAt: handleDataUpdatedAt, ...handleState } = handleQuery;
      const { promise: statePromise, ...stableState } = state;
      const { promise: handlePromise, ...stableHandleState } = handleState;
      expect(data).toBe(123n);
      expect(handleData).toBe(handle);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(handleDataUpdatedAt).toEqual(expect.any(Number));
      expect(statePromise).toBeDefined();
      expect(handlePromise).toBeDefined();
      expect({ ...stableState, handleQuery: stableHandleState }).toMatchInlineSnapshot(`
      {
        "error": null,
        "errorUpdateCount": 0,
        "errorUpdatedAt": 0,
        "failureCount": 0,
        "failureReason": null,
        "fetchStatus": "idle",
        "handleQuery": {
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
        },
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
        "isStale": false,
        "isSuccess": true,
        "refetch": [Function],
        "status": "success",
      }
    `);
    });

    test("error: disabled when getAddress fails", async ({ renderWithProviders, signer }) => {
      vi.mocked(signer.getAddress).mockRejectedValue(new Error("no wallet"));

      const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }));

      await waitFor(() => expect(result.current.handleQuery.fetchStatus).toBe("idle"));
      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.handleQuery.data).toBeUndefined();
      expect(result.current.data).toBeUndefined();
    });

    test("behavior: disabled when signer address unavailable", ({
      renderWithProviders,
      signer,
    }) => {
      vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

      const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }));

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.handleQuery.fetchStatus).toBe("idle");
    });

    test("behavior: disabled when handle not yet resolved", async ({
      renderWithProviders,
      signer,
    }) => {
      vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

      const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }));

      await waitFor(() => expect(result.current.handleQuery.fetchStatus).toBe("fetching"));
      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
    });

    test("behavior: disabled when handle undefined despite enabled=true", async ({
      renderWithProviders,
      signer,
      relayer,
    }) => {
      vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

      const { result } = renderWithProviders(() =>
        useConfidentialBalance({ tokenAddress: TOKEN }, { enabled: true }),
      );

      await waitFor(() => expect(result.current.handleQuery.fetchStatus).toBe("fetching"));
      expect(result.current.fetchStatus).toBe("idle");
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    test("behavior: signer undefined -> defined", async ({
      renderWithProviders,
      signer,
      relayer,
    }) => {
      const handle = `0x${"ac".repeat(32)}` as Address;
      let resolveAddress: (value: Address) => void;
      const addressPromise = new Promise<Address>((resolve) => {
        resolveAddress = resolve;
      });

      vi.mocked(signer.getAddress).mockReturnValue(addressPromise);
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 321n });

      const { result, rerender } = renderWithProviders(() =>
        useConfidentialBalance({ tokenAddress: TOKEN }),
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");

      resolveAddress!(USER);
      rerender();

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
      expect(result.current.data).toBe(321n);
    });

    describe("behavior: full lifecycle", () => {
      test("handle poll -> decrypt cascade", async ({ renderWithProviders, signer, relayer }) => {
        const handleA = `0x${"ab".repeat(32)}` as Address;
        const handleB = `0x${"bc".repeat(32)}` as Address;
        vi.mocked(signer.readContract)
          .mockResolvedValueOnce(handleA)
          .mockResolvedValueOnce(handleB);
        vi.mocked(relayer.userDecrypt).mockImplementation(async ({ handles }) => {
          const value = handles[0] === handleA ? 111n : 222n;
          return { [handles[0] as Address]: value };
        });

        const { result } = renderWithProviders(() =>
          useConfidentialBalance({ tokenAddress: TOKEN }),
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
        expect(result.current.handleQuery.data).toBe(handleA);
        expect(result.current.data).toBe(111n);

        await act(async () => {
          await result.current.handleQuery.refetch();
        });

        await waitFor(() => expect(result.current.handleQuery.data).toBe(handleB), {
          timeout: 5_000,
        });
        await waitFor(() => expect(result.current.data).toBe(222n), { timeout: 5_000 });
        expect(relayer.userDecrypt).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ handles: [handleA] }),
        );
        expect(relayer.userDecrypt).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ handles: [handleB] }),
        );
      });
    });

    test("behavior: re-render preserves cached data", async ({
      renderWithProviders,
      signer,
      relayer,
    }) => {
      const handle = `0x${"ad".repeat(32)}` as Address;
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 999n });

      const { result, rerender } = renderWithProviders(() =>
        useConfidentialBalance({ tokenAddress: TOKEN }),
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
      const firstData = result.current.data;

      rerender();

      expect(result.current.data).toBe(firstData);
    });

    test("behavior: disabled when user passes enabled=false", async ({
      renderWithProviders,
      signer,
    }) => {
      const { result } = renderWithProviders(() =>
        useConfidentialBalance({ tokenAddress: TOKEN }, { enabled: false }),
      );

      await waitFor(() => expect(signer.getAddress).toHaveBeenCalled(), { timeout: 5_000 });

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.handleQuery.fetchStatus).toBe("idle");
      expect(result.current.handleQuery.isFetched).toBe(false);
      expect(signer.readContract).not.toHaveBeenCalled();
    });
  });
});
