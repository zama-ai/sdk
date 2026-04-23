import type { Hex } from "../utils/hex";

/** Framework-agnostic log shape compatible with any Ethereum provider. */
export interface RawLog {
  /** Indexed event topics (topic[0] is the event signature hash). */
  readonly topics: readonly Hex[];
  /** ABI-encoded non-indexed event data. */
  readonly data: Hex;
}

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
