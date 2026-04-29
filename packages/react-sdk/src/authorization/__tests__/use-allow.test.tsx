import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheRemoved } from "../../test-helpers";
import {
  OTHER_TOKEN,
  TOKEN,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useAllow } from "../use-allow";

describe("useAllow", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useAllow());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: removes isAllowed query after allow", async ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useAllow());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expectCacheRemoved(queryClient, zamaQueryKeys.isAllowed.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    let removedDuringCallback: boolean | undefined;
    const onSuccess = vi.fn((_: void, variables: unknown) => {
      removedDuringCallback =
        queryClient.getQueryCache().find({ queryKey: zamaQueryKeys.isAllowed.all }) === undefined;
      expect(variables).toEqual([TOKEN, OTHER_TOKEN]);
    });
    const { result, queryClient } = renderWithProviders(() =>
      useAllow({
        onSuccess,
      }),
    );
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(removedDuringCallback).toBe(false);
    expectCacheRemoved(queryClient, zamaQueryKeys.isAllowed.all);
  });
});
