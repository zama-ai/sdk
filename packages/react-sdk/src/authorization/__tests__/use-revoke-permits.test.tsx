import { act } from "@testing-library/react";
import { ZamaSDK } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { afterEach, describe, expect, test, vi } from "../../test-fixtures";
import { useRevokePermits } from "../use-revoke-permits";

describe("useRevokePermits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRevokePermits());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: removes isAllowed and decryption queries after revokePermits", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
  }) => {
    vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const { result, queryClient } = renderWithProviders(() => useRevokePermits());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.isAllowed.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
  }) => {
    vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevokePermits({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toEqual([tokenAddress, otherTokenAddress]);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.isAllowed.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards address list to sdk.revokePermits", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
  }) => {
    const spy = vi.spyOn(ZamaSDK.prototype, "revokePermits").mockResolvedValue(undefined);
    const { result } = renderWithProviders(() => useRevokePermits());

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith([tokenAddress, otherTokenAddress]);
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
