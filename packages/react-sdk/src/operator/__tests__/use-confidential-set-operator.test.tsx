import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useConfidentialSetOperator } from "../use-confidential-set-operator";

describe("useConfidentialSetOperator", () => {
  test("default", ({ renderWithProviders, tokenAddress, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useConfidentialSetOperator(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates operator query after confidential set operator", async ({
    renderWithProviders,
    signer,
    otherTokenAddress,
    recipientAddress,
    tokenAddress,
    expectCacheInvalidated,
    expectCacheUntouched,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialSetOperator(tokenAddress),
    );

    const operatorKey = zamaQueryKeys.confidentialIsOperator.token(tokenAddress);
    const otherOperatorKey = zamaQueryKeys.confidentialIsOperator.token(otherTokenAddress);
    queryClient.setQueryData(operatorKey, true);
    queryClient.setQueryData(otherOperatorKey, false);

    await act(() => result.current.mutateAsync({ operator: recipientAddress }));

    expect(queryClient.getQueryData(operatorKey)).toBe(true);
    expectCacheInvalidated(queryClient, operatorKey);
    expectCacheUntouched(queryClient, otherOperatorKey, false);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    expectCacheInvalidated,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const operatorKey = zamaQueryKeys.confidentialIsOperator.token(tokenAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialSetOperator(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(operatorKey, true);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ operator: recipientAddress }),
      onSuccess,
      (client: QueryClient) => expectCacheInvalidated(client, operatorKey),
    );
  });
});
