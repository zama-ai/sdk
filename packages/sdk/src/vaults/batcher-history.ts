import { getAddress, type Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import { currentBatchIdContract } from "./contracts";

/** The two sides a vault has a batcher for. */
export const BATCHER_DIRECTIONS = ["deposit", "redeem"] as const;

/** Union of all {@link BATCHER_DIRECTIONS} values. */
export type BatcherDirection = (typeof BATCHER_DIRECTIONS)[number];

/**
 * A batcher that has been superseded but still takes joins, until its on-chain
 * `currentBatchId` passes `lastBatchId`.
 */
export interface RetiredBatcher {
  /** The retired batcher contract. */
  readonly address: Address;
  /** The last batch this batcher accepts joins into. */
  readonly lastBatchId: bigint;
}

/**
 * Every batcher a vault has used in one direction. Batchers are replaced rather
 * than upgraded, and a replaced one keeps serving its open batches — its
 * balances stay claimable and quittable forever — so an entry is never removed.
 */
export interface BatcherHistory {
  /** Oldest first. */
  readonly retired: readonly RetiredBatcher[];
  /** The batcher joins reach once every retired one is exhausted. */
  readonly latest: Address;
}

/** A history with every address checksummed. */
export function normalizeBatcherHistory(history: BatcherHistory): BatcherHistory {
  return {
    retired: history.retired.map((batcher) => ({
      address: getAddress(batcher.address),
      lastBatchId: batcher.lastBatchId,
    })),
    latest: getAddress(history.latest),
  };
}

/**
 * The batcher a new join would reach: the first retired batcher still under its
 * `lastBatchId`, else {@link BatcherHistory.latest}.
 *
 * Handover happens when someone dispatches that last batch, not at a
 * wall-clock cutoff, so this has to be read before every join rather than
 * resolved once and held.
 */
export async function resolveActiveBatcher(
  sdk: ZamaSDK,
  history: BatcherHistory,
): Promise<Address> {
  const retired = await Promise.all(
    history.retired.map(async (batcher) => ({
      batcher,
      currentBatchId: await sdk.provider.readContract(
        currentBatchIdContract(getAddress(batcher.address)),
      ),
    })),
  );
  const active = retired.find(
    ({ batcher, currentBatchId }) => currentBatchId <= batcher.lastBatchId,
  );
  return getAddress(active?.batcher.address ?? history.latest);
}
