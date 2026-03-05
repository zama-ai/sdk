import { act } from "@testing-library/react";
import { isAllowedQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated } from "../../test-helpers";
import {
  OTHER_TOKEN,
  TOKEN,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useRevoke } from "../use-revoke";

describe("useRevoke", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRevoke());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates isAllowed query after revoke", async ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useRevoke());
    queryClient.setQueryData(isAllowedQueryKeys.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expectCacheInvalidated(queryClient, isAllowedQueryKeys.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevoke({ onSuccess }));
    queryClient.setQueryData(isAllowedQueryKeys.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toEqual([TOKEN, OTHER_TOKEN]);
    expectCacheInvalidated(queryClient, isAllowedQueryKeys.all);
  });
});
