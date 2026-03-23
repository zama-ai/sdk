import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, test } from "../../test-fixtures";
import { useUserDecryptedValue } from "../use-user-decrypted-value";

describe("useUserDecryptedValue", () => {
  test("default", ({ createWrapper }) => {
    const cached = 1000n;
    const ctx = createWrapper();
    ctx.queryClient.setQueryData(zamaQueryKeys.decryption.handle("0xhandle"), cached);

    const { result } = renderHook(() => useUserDecryptedValue("0xhandle"), {
      wrapper: ctx.Wrapper,
    });

    const { data, dataUpdatedAt, ...state } = result.current;
    const { promise: statePromise, ...stableState } = state;
    expect(data).toBe(cached);
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
        "isEnabled": false,
        "isError": false,
        "isFetched": true,
        "isFetchedAfterMount": false,
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

  test("behavior: re-render preserves cached data", ({ createWrapper }) => {
    const cached = 1000n;
    const ctx = createWrapper();
    ctx.queryClient.setQueryData(zamaQueryKeys.decryption.handle("0xhandle"), cached);

    const { result, rerender } = renderHook(() => useUserDecryptedValue("0xhandle"), {
      wrapper: ctx.Wrapper,
    });

    const firstData = result.current.data;
    rerender();

    expect(firstData).toBe(cached);
    expect(result.current.data).toBe(firstData);
  });
});

describe("useUserDecryptedValue (cache behavior)", () => {
  it("reads from decryption cache", ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useUserDecryptedValue("0xhandle1"));

    expect(result.current.data).toBeUndefined();

    queryClient.setQueryData(zamaQueryKeys.decryption.handle("0xhandle1"), 42n);

    const query = queryClient
      .getQueryCache()
      .find({ queryKey: zamaQueryKeys.decryption.handle("0xhandle1") });
    expect(query?.options.queryKeyHashFn).toBe(hashFn);
  });

  it("handles undefined handle", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUserDecryptedValue(undefined));
    expect(result.current.data).toBeUndefined();
  });
});
