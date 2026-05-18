import { act } from "@testing-library/react";
import { ZamaSDK } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { afterEach, describe, expect, test, vi } from "../../test-fixtures";
import { useRevokePermits } from "../use-revoke-permits";

describe("useRevokePermits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("default", ({ renderWithProviders, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useRevokePermits());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: removes isAllowed and decryption queries after revokePermits", async ({
    renderWithProviders,
    OTHER_TOKEN,
    TOKEN,
    expectCacheRemoved,
  }) => {
    vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const { result, queryClient } = renderWithProviders(() => useRevokePermits());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expectCacheRemoved(queryClient, zamaQueryKeys.isAllowed.all);
    expectCacheRemoved(queryClient, zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    OTHER_TOKEN,
    TOKEN,
    expectCacheRemoved,
  }) => {
    vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevokePermits({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toEqual([TOKEN, OTHER_TOKEN]);
    expectCacheRemoved(queryClient, zamaQueryKeys.isAllowed.all);
    expectCacheRemoved(queryClient, zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards address list to sdk.revokePermits", async ({
    renderWithProviders,
    OTHER_TOKEN,
    TOKEN,
  }) => {
    const spy = vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const { result } = renderWithProviders(() => useRevokePermits());

    await act(() => result.current.mutateAsync([TOKEN, OTHER_TOKEN]));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith([TOKEN, OTHER_TOKEN]);
  });

  test("behavior: passes no arguments to sdk.revokePermits when called with undefined", async ({
    renderWithProviders,
  }) => {
    const spy = vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const { result } = renderWithProviders(() => useRevokePermits());

    await act(() => result.current.mutateAsync(undefined));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith();
  });
});
