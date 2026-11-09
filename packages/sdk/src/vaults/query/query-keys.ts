import { getAddress, type Address } from "viem";

// Omit an unset `chainId`: TanStack matches every filter field, so `chainId: undefined` matches no pinned key.
function batcherParams(
  batcherAddress: Address,
  chainId: number | undefined,
): { readonly batcherAddress: Address; readonly chainId?: number } {
  const params = { batcherAddress: getAddress(batcherAddress) };
  return chainId === undefined ? params : { ...params, chainId };
}

/**
 * Query keys for the vaults module.
 *
 * A `batcher(...)` key is a prefix of every `batch(...)` key for that batcher,
 * so invalidating it clears all of them at once. Keys carry the batcher's
 * `chainId` when it reads another chain than the provider's current one.
 */
export const vaultQueryKeys = {
  currentBatchId: {
    batcher: (batcherAddress: Address, chainId?: number) =>
      ["zama.vault.currentBatchId", batcherParams(batcherAddress, chainId)] as const,
  },
  paused: {
    batcher: (batcherAddress: Address, chainId?: number) =>
      ["zama.vault.paused", batcherParams(batcherAddress, chainId)] as const,
  },
  batcherTokens: {
    batcher: (batcherAddress: Address, chainId?: number) =>
      ["zama.vault.batcherTokens", batcherParams(batcherAddress, chainId)] as const,
  },
  batchState: {
    batcher: (batcherAddress: Address) =>
      ["zama.vault.batchState", { batcherAddress: getAddress(batcherAddress) }] as const,
    batch: (batcherAddress: Address, batchId: bigint | undefined, chainId?: number) =>
      [
        "zama.vault.batchState",
        { batcherAddress: getAddress(batcherAddress), batchId, chainId },
      ] as const,
  },
  batchStatus: {
    batcher: (batcherAddress: Address) =>
      ["zama.vault.batchStatus", { batcherAddress: getAddress(batcherAddress) }] as const,
    batch: (batcherAddress: Address, batchId: bigint | undefined, chainId?: number) =>
      [
        "zama.vault.batchStatus",
        { batcherAddress: getAddress(batcherAddress), batchId, chainId },
      ] as const,
  },
  timeUntilDispatchable: {
    batcher: (batcherAddress: Address) =>
      ["zama.vault.timeUntilDispatchable", { batcherAddress: getAddress(batcherAddress) }] as const,
    batch: (batcherAddress: Address, batchId: bigint | undefined, chainId?: number) =>
      [
        "zama.vault.timeUntilDispatchable",
        { batcherAddress: getAddress(batcherAddress), batchId, chainId },
      ] as const,
  },
  timeUntilCallbackDeadline: {
    batcher: (batcherAddress: Address) =>
      [
        "zama.vault.timeUntilCallbackDeadline",
        { batcherAddress: getAddress(batcherAddress) },
      ] as const,
    batch: (batcherAddress: Address, batchId: bigint | undefined, chainId?: number) =>
      [
        "zama.vault.timeUntilCallbackDeadline",
        { batcherAddress: getAddress(batcherAddress), batchId, chainId },
      ] as const,
  },
};
