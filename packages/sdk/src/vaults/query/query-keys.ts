import { getAddress, type Address } from "viem";
import type { BatcherDirection, BatcherHistory } from "../batcher-history";
import type { VaultMemberConfig } from "../vault-group";

// Serialized rather than passed through: a query key has to survive
// structural sharing and persistence, and a bigint survives neither.
function serializeHistory(history: BatcherHistory) {
  return {
    retired: history.retired.map(
      (batcher) => `${getAddress(batcher.address)}:${batcher.lastBatchId}`,
    ),
    latest: getAddress(history.latest),
  };
}

/**
 * Query keys for the vaults module.
 *
 * A `batcher(...)` key is a prefix of every `batch(...)` key for that batcher,
 * so invalidating it clears all of them at once.
 */
export const vaultQueryKeys = {
  activeBatcher: {
    history: (history: BatcherHistory) =>
      ["zama.vault.activeBatcher", serializeHistory(history)] as const,
  },
  activeBatchers: {
    // Keyed on what is read, not on the group's id: two groups may share an
    // id, and a member's history can change under the same one.
    group: (vaults: readonly VaultMemberConfig[], direction: BatcherDirection) =>
      [
        "zama.vaultGroup.activeBatchers",
        {
          direction,
          members: vaults.map((member) => ({
            id: member.id,
            ...serializeHistory(member.batchers[direction]),
          })),
        },
      ] as const,
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
