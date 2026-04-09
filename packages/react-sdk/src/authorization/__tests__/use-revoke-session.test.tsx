import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheRemoved } from "../../test-helpers";
import { expectDefaultMutationState } from "../../__tests__/mutation-test-helpers";
import { useRevokeSession } from "../use-revoke-session";

describe("useRevokeSession", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRevokeSession());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: removes isAllowed query after revokeSession", async ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useRevokeSession());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync());

    expectCacheRemoved(queryClient, zamaQueryKeys.isAllowed.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevokeSession({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync());

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toBeUndefined();
    expectCacheRemoved(queryClient, zamaQueryKeys.isAllowed.all);
  });
});
