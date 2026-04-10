import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useConfidentialApprove } from "../use-confidential-approve";
import {
  OTHER_TOKEN,
  RECIPIENT,
  TOKEN,
  expectDefaultMutationState,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useConfidentialApprove", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useConfidentialApprove({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates approval query after confidential approve", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialApprove({ tokenAddress: TOKEN }),
    );

    const approvalKey = zamaQueryKeys.confidentialIsApproved.token(TOKEN);
    const otherApprovalKey = zamaQueryKeys.confidentialIsApproved.token(OTHER_TOKEN);
    queryClient.setQueryData(approvalKey, true);
    queryClient.setQueryData(otherApprovalKey, false);

    await act(() => result.current.mutateAsync({ spender: RECIPIENT }));

    expect(queryClient.getQueryData(approvalKey)).toBe(true);
    expectCacheInvalidated(queryClient, approvalKey);
    expectCacheUntouched(queryClient, otherApprovalKey, false);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const approvalKey = zamaQueryKeys.confidentialIsApproved.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialApprove({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(approvalKey, true);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ spender: RECIPIENT }),
      onSuccess,
      (client) => expectCacheInvalidated(client, approvalKey),
    );
  });
});
