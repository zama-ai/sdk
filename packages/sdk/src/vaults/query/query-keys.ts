import { getAddress, type Address } from "viem";

/**
 * Canonical query-key namespace for the vaults module's TanStack Query
 * factories, kept local to this module (not part of `@zama-fhe/sdk/query`'s
 * `zamaQueryKeys`) — core has no knowledge of verticals, and this one
 * shouldn't either.
 *
 * `batcher(...)` keys are the broader, batchId-less prefix used to invalidate
 * every cached batch for a batcher at once (e.g. after `dispatchBatch`
 * advances which batch is current); `batch(...)` keys scope a single batch.
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
