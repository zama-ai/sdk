import { act } from "@testing-library/react";
import { getAddress } from "viem";
import { Token, type Address, type GenericProvider } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vaultQueryKeys, type VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { describe, expect, joinedLog, mockEncryptedLegs, test, vi } from "../../test-fixtures";
import { useGroupDeposit } from "../use-group-deposit";
import { useGroupRedeem } from "../use-group-redeem";

const ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const REGISTRY = "0x5555555555555555555555555555555555555555" as Address;
const ASSET = "0x2222222222222222222222222222222222222222" as Address;
const ALPHA_SHARE = "0x1111111111111111111111111111111111111111" as Address;
const BETA_SHARE = "0x3333333333333333333333333333333333333333" as Address;
const ALPHA_DEPOSIT = "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA" as Address;
const BETA_DEPOSIT = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const ALPHA_REDEEM = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const BETA_REDEEM = "0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd" as Address;

const ALPHA_VAULT = "0x1010101010101010101010101010101010101010" as Address;
const BETA_VAULT = "0x3030303030303030303030303030303030303030" as Address;

const group: VaultGroupConfig = {
  id: "stable",
  cAsset: ASSET,
  router: ROUTER,
  vaults: [
    {
      id: "alpha",
      vault: ALPHA_VAULT,
      cShare: ALPHA_SHARE,
      batchers: { deposit: ALPHA_DEPOSIT, redeem: ALPHA_REDEEM },
    },
    {
      id: "beta",
      vault: BETA_VAULT,
      cShare: BETA_SHARE,
      batchers: { deposit: BETA_DEPOSIT, redeem: BETA_REDEEM },
    },
  ],
};

const BATCHERS: Readonly<Record<Address, { fromToken: Address; vault: Address }>> = {
  [getAddress(ALPHA_DEPOSIT)]: { fromToken: ASSET, vault: ALPHA_VAULT },
  [getAddress(BETA_DEPOSIT)]: { fromToken: ASSET, vault: BETA_VAULT },
  [getAddress(ALPHA_REDEEM)]: { fromToken: ALPHA_SHARE, vault: ALPHA_VAULT },
  [getAddress(BETA_REDEEM)]: { fromToken: BETA_SHARE, vault: BETA_VAULT },
};

/** Every read a router submission makes, plus the receipt it reads its batch ids from. */
function mockGroupSubmission(provider: GenericProvider, account: Address, batchers: Address[]) {
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { functionName, address } = call as { functionName: string; address: Address };
    switch (functionName) {
      case "tokenWrapperRegistry":
        return REGISTRY;
      case "isConfidentialTokenValid":
      case "isOperator":
        return true;
      case "paused":
        return false;
      case "fromToken":
        return BATCHERS[getAddress(address)]?.fromToken;
      case "vault":
        return BATCHERS[getAddress(address)]?.vault;
      default:
        throw new Error(`Unexpected read of ${functionName}`);
    }
  });
  vi.spyOn(Token.prototype, "balanceOf").mockResolvedValue(1_000_000n);
  vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
    logs: batchers.map((batcher) => joinedLog({ batcher, account, batchId: 7n })),
  });
}

describe("useGroupDeposit", () => {
  test("invalidates the asset's balance and operator caches and every leg's batch reads", async ({
    renderWithProviders,
    provider,
    relayer,
    userAddress,
  }) => {
    mockGroupSubmission(provider, userAddress, [ALPHA_DEPOSIT, BETA_DEPOSIT]);
    mockEncryptedLegs(relayer, 2);

    const { result, queryClient } = renderWithProviders(() => useGroupDeposit({ group }));

    const keys = [
      zamaQueryKeys.confidentialBalance.owner(ASSET, userAddress),
      zamaQueryKeys.confidentialIsOperator.scope(ASSET, userAddress, ALPHA_DEPOSIT),
      vaultQueryKeys.currentBatchId.batcher(ALPHA_DEPOSIT),
      vaultQueryKeys.currentBatchId.batcher(BETA_DEPOSIT),
    ];
    for (const key of keys) {
      queryClient.setQueryData(key, 1n);
    }

    await act(() => result.current.mutateAsync({ vaultId: "alpha", amount: 1_000n }));

    expect(queryClient).toHaveInvalidatedQueries(keys);
  });

  test("forwards onSuccess", async ({ renderWithProviders, provider, relayer, userAddress }) => {
    mockGroupSubmission(provider, userAddress, [ALPHA_DEPOSIT, BETA_DEPOSIT]);
    mockEncryptedLegs(relayer, 2);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useGroupDeposit({ group }, { onSuccess }));
    await act(() => result.current.mutateAsync({ vaultId: "alpha", amount: 1_000n }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });
});

describe("useGroupRedeem", () => {
  test("invalidates every member's share balance and operator caches and every leg's batch reads", async ({
    renderWithProviders,
    provider,
    relayer,
    userAddress,
  }) => {
    mockGroupSubmission(provider, userAddress, [ALPHA_REDEEM, BETA_REDEEM]);
    mockEncryptedLegs(relayer, 2);

    const { result, queryClient } = renderWithProviders(() => useGroupRedeem({ group }));

    const keys = [
      zamaQueryKeys.confidentialBalance.owner(ALPHA_SHARE, userAddress),
      zamaQueryKeys.confidentialBalance.owner(BETA_SHARE, userAddress),
      zamaQueryKeys.confidentialIsOperator.scope(BETA_SHARE, userAddress, ROUTER),
      vaultQueryKeys.currentBatchId.batcher(ALPHA_REDEEM),
      vaultQueryKeys.currentBatchId.batcher(BETA_REDEEM),
    ];
    for (const key of keys) {
      queryClient.setQueryData(key, 1n);
    }

    await act(() => result.current.mutateAsync({ vaultId: "alpha", amount: 500n }));

    expect(queryClient).toHaveInvalidatedQueries(keys);
  });
});
