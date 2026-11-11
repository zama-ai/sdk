import { act, waitFor } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vaultQueryKeys } from "@zama-fhe/sdk/vaults";
import { getAddress } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useBatch } from "../use-batch";
import { useQuit } from "../use-mutations";

const ASSET = getAddress("0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a");
const BATCHER = getAddress("0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA");
const REF = { chainId: 31337, batcher: BATCHER, batchId: 4n };

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

describe("useBatch", () => {
  test("reads the batch and the actions the account can send", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    mockPendingBatch(provider);
    const { result } = renderWithProviders(() => useBatch(REF, { account: userAddress }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      state: "pending",
      actions: ["quit"],
      nextChangeAt: 1_090n,
    });
  });

  test("stays idle without a batch", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useBatch(undefined));
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useQuit", () => {
  test("quits the batch and invalidates vault reads and balances", async ({
    renderWithProviders,
    signer,
    userAddress,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useQuit());
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(ASSET, userAddress);
    queryClient.setQueryData(balanceKey, 0n);

    await act(() => result.current.mutateAsync(REF));

    expect(vi.mocked(signer.writeContract).mock.calls[0]?.[0]).toMatchObject({
      functionName: "quit",
      args: [4n],
    });
    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: vaultQueryKeys.all });
  });
});
