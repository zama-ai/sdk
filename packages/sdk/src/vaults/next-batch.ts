import type { Address } from "viem";

/** A join sent this close to its batch's due time can land after the dispatch and wait a whole cycle. */
export const JOIN_MARGIN_SECONDS = 60n;

/** What one batcher offers a join, read at one block. */
export type BatcherOffer =
  | {
      readonly status: "open";
      readonly batcher: Address;
      readonly batchId: bigint;
      readonly dispatchableAt: bigint;
      /** `dispatchBatch` reverts while the previous batch is still dispatched. */
      readonly blocked: boolean;
    }
  | {
      readonly status: "paused";
      readonly batcher: Address;
      readonly batchId: bigint;
      readonly dispatchableAt: bigint;
    }
  /** Closed on chain, or past its configured `lastBatchId`: it never takes a join again. */
  | { readonly status: "closed"; readonly batcher: Address };

export type OpenOffer = Extract<BatcherOffer, { status: "open" }>;
export type PausedOffer = Extract<BatcherOffer, { status: "paused" }>;

function soonest(offers: readonly OpenOffer[]): OpenOffer | undefined {
  return [...offers].sort((a, b) => {
    if (a.dispatchableAt !== b.dispatchableAt) {
      return a.dispatchableAt < b.dispatchableAt ? -1 : 1;
    }
    // Same order on every client, so a tie does not split the joins.
    const [left, right] = [a.batcher.toLowerCase(), b.batcher.toLowerCase()];
    return left < right ? -1 : left > right ? 1 : 0;
  })[0];
}

/**
 * The batch a join reaches: the unblocked open batch due soonest that is not
 * due within {@link JOIN_MARGIN_SECONDS}, else the blocked one due soonest,
 * else the open one due soonest. With no batcher open, a paused batcher's
 * batch, which no join reaches; `undefined` when every batcher is closed.
 *
 * @internal
 */
export function pickNextBatch(
  offers: readonly BatcherOffer[],
  now: bigint,
): OpenOffer | PausedOffer | undefined {
  const open = offers.filter((offer): offer is OpenOffer => offer.status === "open");
  return (
    soonest(open.filter((o) => !o.blocked && o.dispatchableAt >= now + JOIN_MARGIN_SECONDS)) ??
    soonest(open.filter((o) => o.blocked)) ??
    soonest(open) ??
    offers.find((offer): offer is PausedOffer => offer.status === "paused")
  );
}
