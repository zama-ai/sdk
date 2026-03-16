import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated } from "../../test-helpers";
import {
  OTHER_TOKEN,
  TOKEN,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useRevokeTokens } from "../use-revoke-tokens";

describe("useRevokeTokens", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRevokeTokens());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates isAllowed query after revoke", async ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useRevokeTokens());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expectCacheInvalidated(queryClient, zamaQueryKeys.isAllowed.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevokeTokens({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toEqual([TOKEN, OTHER_TOKEN]);
    expectCacheInvalidated(queryClient, zamaQueryKeys.isAllowed.all);
  });
});
