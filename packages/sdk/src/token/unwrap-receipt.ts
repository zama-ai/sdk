import { getAddress, type Address } from "viem";
import { findUnwrapRequested } from "../events/onchain-events";
import type { EncryptedValue } from "../relayer/types";
import type { TransactionReceipt } from "../types";
import type { RawLog } from "../types/transaction";

/**
 * Where an unwrap request stands on chain. "settled": it was finalized, or the
 * unwrap never opened one. "unknown": a read failed or the unwrap is not mined.
 *
 * @internal
 */
export type UnwrapRequestState = "open" | "settled" | "unknown";

/**
 * The request id from this wrapper's `UnwrapRequested` event in an unwrap
 * receipt's logs. A tx hash from another wrapper must not decode a foreign
 * request id. Logs without an emitter address (older custom adapters) count.
 *
 * @internal
 */
export function unwrapRequestIn(
  logs: readonly RawLog[],
  wrapperAddress: Address,
): EncryptedValue | undefined {
  const wrapper = getAddress(wrapperAddress);
  const ownLogs = logs.filter(
    (log) => log.address === undefined || getAddress(log.address) === wrapper,
  );
  return findUnwrapRequested(ownLogs)?.unwrapRequestId;
}

/**
 * What the receipt of a saved unwrap says about its entry. A reverted unwrap,
 * or a mined transaction that opened no request from this wrapper, is "settled".
 *
 * @internal
 */
export function judgeUnwrapReceipt(
  receipt: TransactionReceipt | null,
  wrapperAddress: Address,
): Exclude<UnwrapRequestState, "open"> | { unwrapRequestId: EncryptedValue } {
  if (!receipt) {
    return "unknown";
  }
  const unwrapRequestId =
    receipt.status === "reverted" ? undefined : unwrapRequestIn(receipt.logs, wrapperAddress);
  return unwrapRequestId === undefined ? "settled" : { unwrapRequestId };
}
