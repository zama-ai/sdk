import { getAddress, type Address } from "viem";

/**
 * Query keys for the vaults module.
 *
 * A `batcher(...)` key is a prefix of every `batch(...)` key for that batcher,
 * so invalidating it clears all of them at once.
 */
export const vaultQueryKeys = {
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
