import { act } from "@testing-library/react";
import { WILDCARD_PERMIT } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useGrantPermit } from "../use-grant-permit";

describe("useGrantPermit", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useGrantPermit());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: removes isAllowed query after allow", async ({
    renderWithProviders,
    tokenAddress,
    otherTokenAddress,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useGrantPermit());
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
  });

  test("cache: removes isAllowed query after a wildcard grant", async ({
    renderWithProviders,
    relayer,
  }) => {
    vi.mocked(relayer.canUseUnifiedDecryptionPermit).mockResolvedValue(true);
    const { result, queryClient } = renderWithProviders(() => useGrantPermit());
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);

    await act(() => result.current.mutateAsync(WILDCARD_PERMIT));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
  }) => {
    let removedDuringCallback: boolean | undefined;
    const onSuccess = vi.fn((_: void, variables: unknown) => {
      removedDuringCallback =
        queryClient.getQueryCache().find({ queryKey: zamaQueryKeys.hasPermit.all }) === undefined;
      expect(variables).toEqual([tokenAddress, otherTokenAddress]);
    });
    const { result, queryClient } = renderWithProviders(() => useGrantPermit({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(removedDuringCallback).toBe(false);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
  });
});
