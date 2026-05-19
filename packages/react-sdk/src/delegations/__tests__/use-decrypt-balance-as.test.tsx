import { act, waitFor } from "@testing-library/react";
import { ZERO_HANDLE } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDecryptBalanceAs } from "../use-decrypt-balance-as";

describe("useDecryptBalanceAs", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useDecryptBalanceAs(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("behavior: calls decryptBalanceAs and returns balance", async ({
    renderWithProviders,
    provider,
    recipientAddress,
    tokenAddress,
  }) => {
    // Return zero handle so decryptBalanceAs short-circuits to 0n
    vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);

    const { result } = renderWithProviders(() => useDecryptBalanceAs(tokenAddress));

    act(() => {
      result.current.mutate({ delegatorAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(0n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);

    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useDecryptBalanceAs(tokenAddress, { onSuccess }));

    act(() => {
      result.current.mutate({ delegatorAddress: recipientAddress });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    expect(onSuccess.mock.calls[0]?.[0]).toBe(0n);
  });
});
