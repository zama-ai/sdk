import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useConfidentialSetOperator } from "../use-confidential-set-operator";
import {
  OTHER_TOKEN,
  RECIPIENT,
  TOKEN,
  expectDefaultMutationState,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useConfidentialSetOperator", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialSetOperator({ tokenAddress: TOKEN }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates operator query after confidential set operator", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialSetOperator({ tokenAddress: TOKEN }),
    );

    const operatorKey = zamaQueryKeys.confidentialIsOperator.token(TOKEN);
    const otherOperatorKey = zamaQueryKeys.confidentialIsOperator.token(OTHER_TOKEN);
    queryClient.setQueryData(operatorKey, true);
    queryClient.setQueryData(otherOperatorKey, false);

    await act(() => result.current.mutateAsync({ operator: RECIPIENT }));

    expect(queryClient.getQueryData(operatorKey)).toBe(true);
    expectCacheInvalidated(queryClient, operatorKey);
    expectCacheUntouched(queryClient, otherOperatorKey, false);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const operatorKey = zamaQueryKeys.confidentialIsOperator.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialSetOperator({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(operatorKey, true);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ operator: RECIPIENT }),
      onSuccess,
      (client) => expectCacheInvalidated(client, operatorKey),
    );
  });
});
