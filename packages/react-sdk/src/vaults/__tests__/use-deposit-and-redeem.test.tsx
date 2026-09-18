import { act } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { WrappedToken } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, mockJoinBalance, mockJoinReceipt, test, vi } from "../../test-fixtures";
import { useDeposit } from "../use-deposit";
import { useRedeem } from "../use-redeem";

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
  test("joins the deposit batch and invalidates the deposit token's balance and operator caches", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: VAULT_ADDRESS });
    mockJoinReceipt(provider, { batcher: DEPOSIT_BATCHER, account: userAddress });
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

    const { result, queryClient } = renderWithProviders(() => useDeposit({ addresses }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(DEPOSIT_TOKEN, userAddress);
    const operatorKey = zamaQueryKeys.confidentialIsOperator.scope(
      DEPOSIT_TOKEN,
      userAddress,
      DEPOSIT_BATCHER,
    );
    queryClient.setQueryData(balanceKey, 3_000n);
    queryClient.setQueryData(operatorKey, false);

    await act(() => result.current.mutateAsync({ amount: 1_000n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey, operatorKey]);
  });

  test("forwards onSuccess", async ({ renderWithProviders, provider, userAddress }) => {
    mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: VAULT_ADDRESS });
    mockJoinReceipt(provider, { batcher: DEPOSIT_BATCHER, account: userAddress });
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useDeposit({ addresses }, { onSuccess }));
    await act(() => result.current.mutateAsync({ amount: 1_000n }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });
});

describe("useRedeem", () => {
  test("joins the redeem batch and invalidates the share token's balance and operator caches", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    mockJoinBalance(provider, { fromToken: SHARE_TOKEN, vault: VAULT_ADDRESS });
    mockJoinReceipt(provider, { batcher: REDEEM_BATCHER, account: userAddress });
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

    const { result, queryClient } = renderWithProviders(() => useRedeem({ addresses }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(SHARE_TOKEN, userAddress);
    const operatorKey = zamaQueryKeys.confidentialIsOperator.scope(
      SHARE_TOKEN,
      userAddress,
      REDEEM_BATCHER,
    );
    queryClient.setQueryData(balanceKey, 500n);
    queryClient.setQueryData(operatorKey, false);

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey, operatorKey]);
  });
});
