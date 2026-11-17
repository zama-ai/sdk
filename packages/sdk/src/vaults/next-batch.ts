import type { Address } from "viem";

/**
 * A keeper dispatches a due batch within minutes, so a join sent in the last
 * minute before the batch is due can miss it and wait a whole cycle.
 */
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
 * The open batch a join reaches: the one dispatched soonest that is not
 * blocked and not due within {@link JOIN_MARGIN_SECONDS}. Otherwise, when every
 * batch waits on its previous one, the one due first, then any open batch.
 * `undefined` when no batcher is open.
 *
 * @internal
 */
export function pickNextBatch(offers: readonly BatcherOffer[], now: bigint): OpenOffer | undefined {
  const open = offers.filter((offer): offer is OpenOffer => offer.status === "open");
  return (
    soonest(open.filter((o) => !o.blocked && o.dispatchableAt >= now + JOIN_MARGIN_SECONDS)) ??
    soonest(open.filter((o) => o.blocked)) ??
    soonest(open)
  );
}
