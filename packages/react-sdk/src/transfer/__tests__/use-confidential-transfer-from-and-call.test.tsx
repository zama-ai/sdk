import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import type { Hex } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useConfidentialTransferFromAndCall } from "../use-confidential-transfer-from-and-call";

// Opaque payload forwarded to the receiver hook — the hook never inspects it.
const DATA = "0xdeadbeef" as Hex;

describe("useConfidentialTransferFromAndCall", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useConfidentialTransferFromAndCall(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates balance after transfer from and call", async ({
    renderWithProviders,
    signer,
    otherTokenAddress,
    recipientAddress,
    tokenAddress,
    transferFromAddress,
    userAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferFromAndCall(tokenAddress),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(otherBalanceKey, 777n);

    await act(() =>
      result.current.mutateAsync({
        from: transferFromAddress,
        to: recipientAddress,
        amount: 100n,
        data: DATA,
      }),
    );

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    transferFromAddress,
    userAddress,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferFromAndCall(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);

    await mutateAndExpectOnSuccess(
      () =>
        result.current.mutateAsync({
          from: transferFromAddress,
          to: recipientAddress,
          amount: 100n,
          data: DATA,
        }),
      onSuccess,
      (client: QueryClient) => expect(client).toHaveInvalidatedQueries([balanceKey]),
    );
  });
});
