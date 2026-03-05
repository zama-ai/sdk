import { act } from "@testing-library/react";
import { isAllowedQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated } from "../../test-helpers";
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

  test("cache: invalidates isAllowed query after allow", async ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useAllow());
    queryClient.setQueryData(isAllowedQueryKeys.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expectCacheInvalidated(queryClient, isAllowedQueryKeys.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    let invalidatedDuringCallback: boolean | undefined;
    const onSuccess = vi.fn((_: void, variables: unknown) => {
      invalidatedDuringCallback =
        queryClient.getQueryState(isAllowedQueryKeys.all)?.isInvalidated ?? false;
      expect(variables).toEqual([TOKEN, OTHER_TOKEN]);
    });
    const { result, queryClient } = renderWithProviders(() =>
      useAllow({
        onSuccess,
      }),
    );
    queryClient.setQueryData(isAllowedQueryKeys.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(invalidatedDuringCallback).toBe(false);
    expectCacheInvalidated(queryClient, isAllowedQueryKeys.all);
  });
});
