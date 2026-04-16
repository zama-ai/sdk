import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, test, vi } from "../../test-fixtures";
import { expectCacheUntouched } from "../../test-helpers";
import { useConfidentialTransferFrom } from "../use-confidential-transfer-from";
import {
  OTHER_TOKEN,
  RECIPIENT,
  TOKEN,
  TRANSFER_FROM,
  USER,
  expectDefaultMutationState,
  expectInvalidatedQueries,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useConfidentialTransferFrom", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialTransferFrom({ tokenAddress: TOKEN }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance after transfer from", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferFrom({ tokenAddress: TOKEN }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(OTHER_TOKEN, USER);
    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(otherBalanceKey, 777n);

    await act(() =>
      result.current.mutateAsync({
        from: TRANSFER_FROM,
        to: RECIPIENT,
        amount: 100n,
      }),
    );

    expectInvalidatedQueries(queryClient, [balanceKey]);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferFrom({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);

    await mutateAndExpectOnSuccess(
      () =>
        result.current.mutateAsync({
          from: TRANSFER_FROM,
          to: RECIPIENT,
          amount: 100n,
        }),
      onSuccess,
      (client) => expectInvalidatedQueries(client, [balanceKey]),
    );
  });
});
