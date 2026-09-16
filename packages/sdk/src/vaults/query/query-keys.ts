import { getAddress, type Address } from "viem";
import type { BatcherDirection, BatcherHistory } from "../batcher-history";

/**
 * Query keys for the vaults module.
 *
 * A `batcher(...)` key is a prefix of every `batch(...)` key for that batcher,
 * so invalidating it clears all of them at once.
 */
export const vaultQueryKeys = {
  activeBatcher: {
    // Serialized rather than passed through: a query key has to survive
    // structural sharing and persistence, and a bigint survives neither.
    history: (history: BatcherHistory) =>
      [
        "zama.vault.activeBatcher",
        {
          retired: history.retired.map(
            (batcher) => `${getAddress(batcher.address)}:${batcher.lastBatchId}`,
          ),
          latest: getAddress(history.latest),
        },
      ] as const,
  },
  activeBatchers: {
    group: (groupId: string, direction: BatcherDirection) =>
      ["zama.vaultGroup.activeBatchers", { groupId, direction }] as const,
  },
  currentBatchId: {
    batcher: (batcherAddress: Address) =>
      ["zama.vault.currentBatchId", { batcherAddress: getAddress(batcherAddress) }] as const,
  },
  batchState: {
    batcher: (batcherAddress: Address) =>
      ["zama.vault.batchState", { batcherAddress: getAddress(batcherAddress) }] as const,
    batch: (batcherAddress: Address, batchId: bigint | undefined) =>
      ["zama.vault.batchState", { batcherAddress: getAddress(batcherAddress), batchId }] as const,
  },
  timeUntilDispatchable: {
    batcher: (batcherAddress: Address) =>
      ["zama.vault.timeUntilDispatchable", { batcherAddress: getAddress(batcherAddress) }] as const,
    batch: (batcherAddress: Address, batchId: bigint | undefined) =>
      [
        "zama.vault.timeUntilDispatchable",
        { batcherAddress: getAddress(batcherAddress), batchId },
      ] as const,
  },
};
