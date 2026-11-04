import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vi } from "vitest";
import type * as ProviderModule from "../../provider";
import { afterEach, describe, expect, test } from "../../test-fixtures";
import { useClearCredentials } from "../use-clear-credentials";

// The SDK's namespaces are frozen, so the hook is handed a stand-in `permits` through the
// provider hook instead of a spy on `Permits.prototype`.
const permits = vi.hoisted(() => ({ revokePermits: vi.fn(), clear: vi.fn() }));
vi.mock("../../provider", async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderModule>()),
  useZamaSDK: () => ({ permits }),
}));

describe("useClearCredentials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useClearCredentials());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: removes isAllowed and decryption queries after clearCredentials", async ({
    renderWithProviders,
  }) => {
    permits.clear.mockResolvedValue(undefined);
    const { result, queryClient } = renderWithProviders(() => useClearCredentials());
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync());

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    permits.clear.mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useClearCredentials({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync());

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toBeUndefined();
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });
});
