import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated } from "../../test-helpers";
import {
  OTHER_TOKEN,
  TOKEN,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useAllowTokens } from "../use-allow-tokens";

describe("useAllowTokens", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useAllowTokens());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates isAllowed query after allow", async ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useAllowTokens());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expectCacheInvalidated(queryClient, zamaQueryKeys.isAllowed.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    let invalidatedDuringCallback: boolean | undefined;
    const onSuccess = vi.fn((_: void, variables: unknown) => {
      invalidatedDuringCallback =
        queryClient.getQueryState(zamaQueryKeys.isAllowed.all)?.isInvalidated ?? false;
      expect(variables).toEqual([TOKEN, OTHER_TOKEN]);
    });
    const { result, queryClient } = renderWithProviders(() =>
      useAllowTokens({
        onSuccess,
      }),
    );
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(invalidatedDuringCallback).toBe(false);
    expectCacheInvalidated(queryClient, zamaQueryKeys.isAllowed.all);
  });
});
