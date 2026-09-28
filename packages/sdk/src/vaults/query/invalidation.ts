import type { Address } from "viem";
import {
  invalidateAfterSetOperator,
  invalidateBalanceQueries,
  type QueryClientLike,
} from "../../query/invalidation";
import { vaultQueryKeys } from "./query-keys";

/** Invalidates every cached batch read for a batcher. */
export function invalidateBatchQueries(
  queryClient: QueryClientLike,
  batcherAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: vaultQueryKeys.currentBatchId.batcher(batcherAddress),
  });
  void queryClient.invalidateQueries({
    queryKey: vaultQueryKeys.batchState.batcher(batcherAddress),
  });
  void queryClient.invalidateQueries({
    queryKey: vaultQueryKeys.timeUntilDispatchable.batcher(batcherAddress),
  });
}

/** Invalidates the caches affected by a join: the input token's balance, and the batcher's batch reads. */
export function invalidateAfterJoin(
  queryClient: QueryClientLike,
  params: { batcherAddress: Address; fromToken: Address },
): void {
  invalidateBalanceQueries(queryClient, params.fromToken);
  invalidateBatchQueries(queryClient, params.batcherAddress);
}

/** Invalidates the caches affected by a group join: every leg token's balance and operator status, and every joined batcher's batch reads. */
export function invalidateAfterGroupJoin(
  queryClient: QueryClientLike,
  params: { tokens: readonly Address[]; batchers: readonly Address[] },
): void {
  for (const token of params.tokens) {
    invalidateBalanceQueries(queryClient, token);
    invalidateAfterSetOperator(queryClient, token);
  }
  for (const batcher of params.batchers) {
    invalidateBatchQueries(queryClient, batcher);
  }
}

/** Invalidates the caches affected by a quit or recover: the input token's balance and the batcher's batch reads. */
export function invalidateAfterQuit(
  queryClient: QueryClientLike,
  params: { batcherAddress: Address; fromToken: Address },
): void {
  invalidateBalanceQueries(queryClient, params.fromToken);
  invalidateBatchQueries(queryClient, params.batcherAddress);
}

/** Invalidates the caches affected by a claim: the output token's balance. */
export function invalidateAfterClaim(
  queryClient: QueryClientLike,
  params: { toToken: Address },
): void {
  invalidateBalanceQueries(queryClient, params.toToken);
}

/** Invalidates the caches affected by a dispatch: a new batch opens and the old one leaves `Pending`. */
export function invalidateAfterDispatchBatch(
  queryClient: QueryClientLike,
  batcherAddress: Address,
): void {
  invalidateBatchQueries(queryClient, batcherAddress);
}
