import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vi } from "vitest";
import type * as ProviderModule from "../../provider";
import { afterEach, describe, expect, test } from "../../test-fixtures";
import { useRevokePermits } from "../use-revoke-permits";

// The SDK's namespaces are frozen, so the hook is handed a stand-in `permits` through the
// provider hook instead of a spy on `Permits.prototype`.
const permits = vi.hoisted(() => ({ revokePermits: vi.fn(), clear: vi.fn() }));
vi.mock("../../provider", async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderModule>()),
  useZamaSDK: () => ({ permits }),
}));

describe("useRevokePermits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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
    permits.revokePermits.mockResolvedValue(undefined);
    const { result, queryClient } = renderWithProviders(() => useRevokePermits());
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    tokenAddress,
    otherTokenAddress,
  }) => {
    permits.revokePermits.mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevokePermits({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toEqual([tokenAddress, otherTokenAddress]);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards address list to sdk.revokePermits", async ({
    renderWithProviders,
    tokenAddress,
    otherTokenAddress,
  }) => {
    const spy = permits.revokePermits.mockResolvedValue(undefined);
    const { result } = renderWithProviders(() => useRevokePermits());

    await act(() => result.current.mutateAsync([tokenAddress, otherTokenAddress]));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith([tokenAddress, otherTokenAddress]);
  });

  test("behavior: passes no arguments to sdk.revokePermits when called with undefined", async ({
    renderWithProviders,
  }) => {
    const spy = permits.revokePermits.mockResolvedValue(undefined);
    const { result } = renderWithProviders(() => useRevokePermits());

    await act(() => result.current.mutateAsync(undefined));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith();
  });
});
