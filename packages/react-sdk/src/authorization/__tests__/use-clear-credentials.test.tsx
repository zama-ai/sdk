import { act } from "@testing-library/react";
import { ZamaSDK } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { afterEach, describe, expect, test, vi } from "../../test-fixtures";
import { useClearCredentials } from "../use-clear-credentials";

describe("useClearCredentials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useClearCredentials());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: removes isAllowed and decryption queries after clearCredentials", async ({
    renderWithProviders,
  }) => {
    vi.spyOn(ZamaSDK.prototype, "clearCredentials").mockResolvedValue(undefined);
    const { result, queryClient } = renderWithProviders(() => useClearCredentials());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync());

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.isAllowed.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    vi.spyOn(ZamaSDK.prototype, "clearCredentials").mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useClearCredentials({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync());

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toBeUndefined();
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.isAllowed.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });
});
