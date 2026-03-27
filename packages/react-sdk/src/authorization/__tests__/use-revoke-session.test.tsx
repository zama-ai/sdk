import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheRemoved } from "../../test-helpers";
import { expectDefaultMutationState } from "../../__tests__/mutation-test-helpers";
import { useRevokeSession } from "../use-revoke-session";

describe("useRevokeSession", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRevokeSession());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates isAllowed query after revokeSession", async ({
    renderWithProviders,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useRevokeSession());
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync());

    expectCacheInvalidated(queryClient, zamaQueryKeys.isAllowed.all);
  });

  test("cache: removes decrypted plaintext queries after revokeSession", async ({
    renderWithProviders,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useRevokeSession());
    const decryptionKey = zamaQueryKeys.decryption.batch(
      [{ handle: "0xh1", contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" }],
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    );
    queryClient.setQueryData(decryptionKey, { "0xh1": 1n });

    await act(() => result.current.mutateAsync());

    expectCacheRemoved(queryClient, decryptionKey);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() => useRevokeSession({ onSuccess }));
    queryClient.setQueryData(zamaQueryKeys.isAllowed.all, true);

    await act(() => result.current.mutateAsync());

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBeUndefined();
    expect(onSuccess.mock.calls[0]?.[1]).toBeUndefined();
    expectCacheInvalidated(queryClient, zamaQueryKeys.isAllowed.all);
  });
});
