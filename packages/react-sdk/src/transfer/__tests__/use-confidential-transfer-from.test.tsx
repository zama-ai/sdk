import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, test, vi } from "../../test-fixtures";
import { useConfidentialTransferFrom } from "../use-confidential-transfer-from";

describe("useConfidentialTransferFrom", () => {
  test("default", ({ renderWithProviders, tokenAddress, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useConfidentialTransferFrom(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance after transfer from", async ({
    renderWithProviders,
    signer,
    otherTokenAddress,
    recipientAddress,
    tokenAddress,
    transferFromAddress,
    userAddress,
    expectCacheUntouched,
    expectInvalidatedQueries,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferFrom(tokenAddress),
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
      }),
    );

    expectInvalidatedQueries(queryClient, [balanceKey]);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    transferFromAddress,
    userAddress,
    expectInvalidatedQueries,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferFrom(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);

    await mutateAndExpectOnSuccess(
      () =>
        result.current.mutateAsync({
          from: transferFromAddress,
          to: recipientAddress,
          amount: 100n,
        }),
      onSuccess,
      (client: QueryClient) => expectInvalidatedQueries(client, [balanceKey]),
    );
  });
});
