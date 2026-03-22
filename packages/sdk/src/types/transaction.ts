import type { Hex } from "viem";
import type { RawLog } from "../events/onchain-events";

/** Framework-agnostic transaction receipt (only the fields the SDK needs). */
export interface TransactionReceipt {
  /** Event logs emitted during the transaction. */
  readonly logs: readonly RawLog[];
}

/** Result of a write operation: the tx hash and its mined receipt. */
export interface TransactionResult {
  /** The transaction hash. */
  txHash: Hex;
  /** The mined transaction receipt. */
  receipt: TransactionReceipt;
}
