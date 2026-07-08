import { act, waitFor } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useRevokeDelegation } from "../use-revoke-delegation";

describe("useRevokeDelegation", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useRevokeDelegation(tokenAddress), {});
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("behavior: calls revokeDelegation with delegate", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract!).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useRevokeDelegation(tokenAddress), {});

    act(() => {
      result.current.mutate({ delegateAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "revokeDelegationForUserDecryption" }),
    );
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract!).mockResolvedValue("0xtxhash");

    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useRevokeDelegation(tokenAddress, { onSuccess }));

    act(() => {
      result.current.mutate({ delegateAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  test("behavior: onSuccess fires before cache invalidation", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract!).mockResolvedValue("0xtxhash");

    const delegationKey = zamaQueryKeys.delegationStatus.all;
    let cacheWasValidDuringOnSuccess = false;

    const onSuccess = vi.fn((_data, _variables, _onMutateResult, context) => {
      const state = context.client.getQueryState(delegationKey);
      cacheWasValidDuringOnSuccess = state !== undefined && !state.isInvalidated;
    });

    const { result, queryClient } = renderWithProviders(() =>
      useRevokeDelegation(tokenAddress, { onSuccess }),
    );

    // Seed the cache so invalidation is observable
    queryClient.setQueryData(delegationKey, { delegated: false });

    act(() => {
      result.current.mutate({ delegateAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    expect(cacheWasValidDuringOnSuccess).toBe(true);
  });
});
