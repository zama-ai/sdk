import { describe, expect, test } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useActivityFeed } from "../use-activity-feed";
import { TOKEN, USER } from "../../__tests__/mutation-test-helpers";

describe("useActivityFeed", () => {
  test("behavior: disabled when logs is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: USER,
        logs: undefined,
      }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when userAddress is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: undefined,
        logs: [],
      }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("default", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: USER,
        logs: [],
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const { data, dataUpdatedAt, ...state } = result.current;
    const { promise: statePromise, ...stableState } = state;
    expect(data).toEqual([]);
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
        "isStale": false,
        "isSuccess": true,
        "refetch": [Function],
        "status": "success",
      }
    `);
  });

  test("behavior: params undefined -> defined", async ({ createWrapper, signer }) => {
    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ userAddress, logs }) =>
        useActivityFeed({
          tokenAddress: TOKEN,
          userAddress,
          logs,
          decrypt: false,
        }),
      {
        wrapper: ctx.Wrapper,
        initialProps: {
          userAddress: undefined as Address | undefined,
          logs: undefined as [] | undefined,
        },
      },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({
      userAddress: USER,
      logs: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
