import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useAllow } from "../use-allow";

describe("useAllow", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useAllow());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: removes isAllowed query after allow", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useAllow());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.isAllowed.all);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
  }) => {
    let removedDuringCallback: boolean | undefined;
    const onSuccess = vi.fn((_: void, variables: unknown) => {
      removedDuringCallback =
        queryClient.getQueryCache().find({ queryKey: zamaQueryKeys.isAllowed.all }) === undefined;
      expect(variables).toEqual([tokenAddress, otherTokenAddress]);
    });
    const { result, queryClient } = renderWithProviders(() =>
      useAllow({
        onSuccess,
      }),
    );
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(removedDuringCallback).toBe(false);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.isAllowed.all);
  });
});
