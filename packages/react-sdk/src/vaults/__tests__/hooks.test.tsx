import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { defineVaults, vaultQueryKeys, type JoinRecord } from "@zama-fhe/sdk/vaults";
import { getAddress } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useExit } from "../use-mutations";
import { usePosition } from "../use-position";

const ASSET = getAddress("0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a");
const ALPHA = getAddress("0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA");
const ALPHA_REDEEM = getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");

const VAULTS = defineVaults({
  chainId: 31337,
  groups: {
    solo: {
      asset: ASSET,
      vaults: { main: { depositBatcher: ALPHA, redeemBatcher: ALPHA_REDEEM } },
    },
  },
});

function record(account: Address): JoinRecord<"solo", "main"> {
  return {
    v: 1,
    chainId: 31337,
    groupId: "solo",
    direction: "deposit",
    account,
    legs: [{ vaultId: "main", batcher: ALPHA, batchId: 4n }],
  };
}

// A pending batch, dispatchable in 90 seconds.
function mockPendingBatch(provider: { readContract: unknown; getBlockTimestamp: unknown }) {
  vi.mocked(provider.getBlockTimestamp as () => Promise<bigint>).mockResolvedValue(1_000n);
  vi.mocked(provider.readContract as (call: unknown) => Promise<unknown>).mockImplementation(
    async (call: unknown) => {
      const { functionName } = call as { functionName: string };
      switch (functionName) {
        case "batchState":
          return 0;
        case "batchCreatedAt":
          return 990n;
        case "batchMinBatchAge":
          return 100n;
        case "paused":
          return false;
        case "exchangeRateDecimals":
          return 0;
        case "deposits":
          return `0x${"ab".repeat(32)}`;
        default:
          return 0n;
      }
    },
  );
}

describe("usePosition", () => {
  test("reads the position and the actions legal now", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    mockPendingBatch(provider);
    const { result } = renderWithProviders(() => usePosition(VAULTS, record(userAddress)));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.phase).toBe("queued");
    expect(result.current.data?.availableActions).toStrictEqual(["exit"]);
    expect(result.current.data?.nextChangeAt).toBe(1_090n);
  });

  test("stays idle without a record", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => usePosition(VAULTS, undefined));
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useExit", () => {
  test("quits the pending leg and invalidates the group's reads and balances", async ({
    renderWithProviders,
    provider,
    signer,
    userAddress,
  }) => {
    mockPendingBatch(provider);
    const { result, queryClient } = renderWithProviders(() => useExit(VAULTS));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(ASSET, userAddress);
    queryClient.setQueryData(balanceKey, 0n);

    await act(() => result.current.mutateAsync(record(userAddress)));

    expect(vi.mocked(signer.writeContract).mock.calls[0]?.[0].functionName).toBe("quit");
    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: vaultQueryKeys.group(31337, "solo") });
  });
});
