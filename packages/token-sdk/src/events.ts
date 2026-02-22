/**
 * Framework-agnostic event decoders for confidential token contracts.
 * No viem/ethers dependency — works with raw log data from any provider.
 */

import type { Address } from "./relayer/relayer-sdk.types";

// ---------------------------------------------------------------------------
// Generic log shape
// ---------------------------------------------------------------------------

export interface RawLog {
  readonly topics: readonly string[];
  readonly data: string;
}

// ---------------------------------------------------------------------------
// Event topic0 constants (keccak256 of canonical signature)
// ---------------------------------------------------------------------------

export const Topics = {
  ConfidentialTransfer: "0x67500e8d0ed826d2194f514dd0d8124f35648ab6e3fb5e6ed867134cffe661e9",
  Wrapped: "0x1f7907f4d84043abe0fb7c74e8865ee5fe93fe4f691c54a7b8fa9d6fb17c7cba",
  UnwrapRequested: "0x77d02d353c5629272875d11f1b34ec4c65d7430b075575b78cd2502034c469ee",
  UnwrappedFinalized: "0xc64e7c81b18b674fc5b037d8a0041bfe3332d86c780a4688f404ee01fbabb152",
  UnwrappedStarted: "0x3838891d4843c6d7f9f494570b6fd8843f4e3c3ddb817c1411760bd31b819806",
} as const;

// ---------------------------------------------------------------------------
// Typed event interfaces
// ---------------------------------------------------------------------------

export interface ConfidentialTransferEvent {
  readonly eventName: "ConfidentialTransfer";
  readonly from: string;
  readonly to: string;
  readonly encryptedAmountHandle: string;
}

export interface WrappedEvent {
  readonly eventName: "Wrapped";
  readonly mintAmount: bigint;
  readonly amountIn: bigint;
  readonly feeAmount: bigint;
  readonly to: string;
  readonly mintTxId: bigint;
}

export interface UnwrapRequestedEvent {
  readonly eventName: "UnwrapRequested";
  readonly receiver: string;
  readonly encryptedAmount: Address;
}

export interface UnwrappedFinalizedEvent {
  readonly eventName: "UnwrappedFinalized";
  readonly burntAmountHandle: string;
  readonly finalizeSuccess: boolean;
  readonly feeTransferSuccess: boolean;
  readonly burnAmount: bigint;
  readonly unwrapAmount: bigint;
  readonly feeAmount: bigint;
  readonly nextTxId: bigint;
}

export interface UnwrappedStartedEvent {
  readonly eventName: "UnwrappedStarted";
  readonly returnVal: boolean;
  readonly requestId: bigint;
  readonly txId: bigint;
  readonly to: string;
  readonly refund: string;
  readonly requestedAmount: string;
  readonly burnAmount: string;
}

export type TokenEvent =
  | ConfidentialTransferEvent
  | WrappedEvent
  | UnwrapRequestedEvent
  | UnwrappedFinalizedEvent
  | UnwrappedStartedEvent;

// ---------------------------------------------------------------------------
// ABI decoding helpers (no external deps)
// ---------------------------------------------------------------------------

function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40);
}

function topicToBigInt(topic: string): bigint {
  return BigInt(topic);
}

function topicToBytes32(topic: string): string {
  // topics are already 32-byte hex values with 0x prefix
  return topic;
}

function wordAt(data: string, index: number): string {
  // data starts with "0x", each word is 64 hex chars (32 bytes)
  const start = 2 + index * 64;
  const word = data.slice(start, start + 64);
  return word.length === 64 ? word : word.padEnd(64, "0");
}

function wordToAddress(data: string, index: number): string {
  return "0x" + wordAt(data, index).slice(-40);
}

function wordToBigInt(data: string, index: number): bigint {
  return BigInt("0x" + wordAt(data, index));
}

function wordToBool(data: string, index: number): boolean {
  return BigInt("0x" + wordAt(data, index)) !== 0n;
}

function wordToBytes32(data: string, index: number): Address {
  return `0x${wordAt(data, index)}`;
}

// ---------------------------------------------------------------------------
// Individual decoders
// ---------------------------------------------------------------------------

/**
 * ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)
 * All 3 params indexed → topics[1..3], no data.
 */
export function decodeConfidentialTransfer(log: RawLog): ConfidentialTransferEvent | null {
  if (log.topics[0] !== Topics.ConfidentialTransfer) return null;
  if (log.topics.length < 4) return null;

  return {
    eventName: "ConfidentialTransfer",
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    encryptedAmountHandle: topicToBytes32(log.topics[3]),
  };
}

/**
 * Wrapped(uint64 mintAmount, uint256 amountIn, uint256 feeAmount, address indexed to_, uint256 indexed mintTxId)
 * Indexed: to_ (topics[1]), mintTxId (topics[2])
 * Data: mintAmount (uint64, abi-encoded as uint256), amountIn, feeAmount
 */
export function decodeWrapped(log: RawLog): WrappedEvent | null {
  if (log.topics[0] !== Topics.Wrapped) return null;
  if (log.topics.length < 3) return null;

  return {
    eventName: "Wrapped",
    to: topicToAddress(log.topics[1]),
    mintTxId: topicToBigInt(log.topics[2]),
    mintAmount: wordToBigInt(log.data, 0),
    amountIn: wordToBigInt(log.data, 1),
    feeAmount: wordToBigInt(log.data, 2),
  };
}

/**
 * UnwrapRequested(address indexed receiver, bytes32 amount)
 * Indexed: receiver (topics[1])
 * Data: amount (bytes32)
 */
export function decodeUnwrapRequested(log: RawLog): UnwrapRequestedEvent | null {
  if (log.topics[0] !== Topics.UnwrapRequested) return null;
  if (log.topics.length < 2) return null;

  return {
    eventName: "UnwrapRequested",
    receiver: topicToAddress(log.topics[1]),
    encryptedAmount: wordToBytes32(log.data, 0),
  };
}

/**
 * UnwrappedFinalized(bytes32 indexed burntAmountHandle, bool finalizeSuccess, bool feeTransferSuccess,
 *                    uint64 burnAmount, uint256 unwrapAmount, uint256 feeAmount, uint256 indexed nextTxId)
 * Indexed: burntAmountHandle (topics[1]), nextTxId (topics[2])
 * Data: finalizeSuccess, feeTransferSuccess, burnAmount, unwrapAmount, feeAmount
 */
export function decodeUnwrappedFinalized(log: RawLog): UnwrappedFinalizedEvent | null {
  if (log.topics[0] !== Topics.UnwrappedFinalized) return null;
  if (log.topics.length < 3) return null;

  return {
    eventName: "UnwrappedFinalized",
    burntAmountHandle: topicToBytes32(log.topics[1]),
    nextTxId: topicToBigInt(log.topics[2]),
    finalizeSuccess: wordToBool(log.data, 0),
    feeTransferSuccess: wordToBool(log.data, 1),
    burnAmount: wordToBigInt(log.data, 2),
    unwrapAmount: wordToBigInt(log.data, 3),
    feeAmount: wordToBigInt(log.data, 4),
  };
}

/**
 * UnwrappedStarted(bool returnVal, uint256 indexed requestId, uint256 indexed txId, address indexed to,
 *                  address refund, bytes32 requestedAmount, bytes32 burnAmount)
 * Indexed: requestId (topics[1]), txId (topics[2]), to (topics[3])
 * Data: returnVal, refund, requestedAmount, burnAmount
 */
export function decodeUnwrappedStarted(log: RawLog): UnwrappedStartedEvent | null {
  if (log.topics[0] !== Topics.UnwrappedStarted) return null;
  if (log.topics.length < 4) return null;

  return {
    eventName: "UnwrappedStarted",
    requestId: topicToBigInt(log.topics[1]),
    txId: topicToBigInt(log.topics[2]),
    to: topicToAddress(log.topics[3]),
    returnVal: wordToBool(log.data, 0),
    refund: wordToAddress(log.data, 1),
    requestedAmount: wordToBytes32(log.data, 2),
    burnAmount: wordToBytes32(log.data, 3),
  };
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Try all decoders on a single log and return the first match, or `null`.
 *
 * @example
 * ```ts
 * const event = decodeTokenEvent(log);
 * if (event?.eventName === "ConfidentialTransfer") {
 *   console.log(event.from, event.to);
 * }
 * ```
 */
export function decodeTokenEvent(log: RawLog): TokenEvent | null {
  return (
    decodeConfidentialTransfer(log) ??
    decodeWrapped(log) ??
    decodeUnwrapRequested(log) ??
    decodeUnwrappedFinalized(log) ??
    decodeUnwrappedStarted(log)
  );
}

/**
 * Batch-decode an array of logs, skipping unrecognized entries.
 *
 * @example
 * ```ts
 * const events = decodeTokenEvents(receipt.logs);
 * ```
 */
export function decodeTokenEvents(logs: readonly RawLog[]): TokenEvent[] {
  const events: TokenEvent[] = [];
  for (const log of logs) {
    const event = decodeTokenEvent(log);
    if (event) events.push(event);
  }
  return events;
}

/**
 * Find the first {@link UnwrapRequestedEvent} in a logs array.
 *
 * @example
 * ```ts
 * const event = findUnwrapRequested(receipt.logs);
 * if (event) console.log(event.receiver, event.encryptedAmount);
 * ```
 */
export function findUnwrapRequested(logs: readonly RawLog[]): UnwrapRequestedEvent | null {
  for (const log of logs) {
    const event = decodeUnwrapRequested(log);
    if (event) return event;
  }
  return null;
}

/**
 * Find the first {@link WrappedEvent} in a logs array.
 *
 * @example
 * ```ts
 * const event = findWrapped(receipt.logs);
 * if (event) console.log(event.to, event.amountIn);
 * ```
 */
export function findWrapped(logs: readonly RawLog[]): WrappedEvent | null {
  for (const log of logs) {
    const event = decodeWrapped(log);
    if (event) return event;
  }
  return null;
}

/**
 * All 5 confidential token event topic0 hashes.
 * Pass to `getLogs({ topics: [TOKEN_TOPICS] })` to fetch
 * all confidential token events in a single RPC call.
 */
export const TOKEN_TOPICS = [
  Topics.ConfidentialTransfer,
  Topics.Wrapped,
  Topics.UnwrapRequested,
  Topics.UnwrappedFinalized,
  Topics.UnwrappedStarted,
] as const;
