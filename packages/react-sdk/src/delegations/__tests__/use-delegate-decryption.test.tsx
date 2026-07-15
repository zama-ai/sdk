import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDelegateDecryption } from "../use-delegate-decryption";
const ACL = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D" as Address;

describe("useDelegateDecryption", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useDelegateDecryption(tokenAddress), {});
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("behavior: calls delegateDecryption with delegate", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract!).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useDelegateDecryption(tokenAddress), {});

    act(() => {
      result.current.mutate({ delegateAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: ACL, functionName: "delegateForUserDecryption" }),
    );
  });

  test("behavior: passes expiration options", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract!).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useDelegateDecryption(tokenAddress), {});

    const expirationDate = new Date("2030-01-01T00:00:00Z");
    act(() => {
      result.current.mutate({ delegateAddress: recipientAddress, expirationDate });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [recipientAddress, tokenAddress, BigInt(Math.floor(expirationDate.getTime() / 1000))],
      }),
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

    const { result } = renderWithProviders(() =>
      useDelegateDecryption(tokenAddress, { onSuccess }),
    );

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
      useDelegateDecryption(tokenAddress, { onSuccess }),
    );

    // Seed the cache so invalidation is observable
    queryClient.setQueryData(delegationKey, { delegated: true });

    act(() => {
      result.current.mutate({ delegateAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    expect(cacheWasValidDuringOnSuccess).toBe(true);
  });
});
