import { act } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { WrappedToken } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDeposit } from "../use-deposit";
import { useRequestWithdrawal } from "../use-request-withdrawal";

const VAULT_ADDRESS = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const DEPOSIT_BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const REDEEM_BATCHER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
const DEPOSIT_TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const SHARE_TOKEN = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

const addresses = {
  vault: VAULT_ADDRESS,
  depositBatcher: DEPOSIT_BATCHER,
  redeemBatcher: REDEEM_BATCHER,
};

describe("useDeposit", () => {
  test("joins the deposit batch and invalidates the deposit token's balance cache", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN); // fromToken()
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

    const { result, queryClient } = renderWithProviders(() => useDeposit({ addresses }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(DEPOSIT_TOKEN, userAddress);
    queryClient.setQueryData(balanceKey, 3_000n);

    await act(() => result.current.mutateAsync({ amount: 1_000n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
  });

  test("forwards onSuccess", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN);
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useDeposit({ addresses }, { onSuccess }));
    await act(() => result.current.mutateAsync({ amount: 1_000n }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });
});

describe("useRequestWithdrawal", () => {
  test("joins the redeem batch and invalidates the share token's balance cache", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(SHARE_TOKEN); // toToken()
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

    const { result, queryClient } = renderWithProviders(() => useRequestWithdrawal({ addresses }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(SHARE_TOKEN, userAddress);
    queryClient.setQueryData(balanceKey, 500n);

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
  });
});
