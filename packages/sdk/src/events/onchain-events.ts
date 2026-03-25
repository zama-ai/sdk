/**
 * Framework-agnostic event decoders for confidential token contracts.
 * Works with raw log data from any provider.
 */

import type { Handle } from "../relayer/relayer-sdk.types";
import { getAddress, type Address, type Hex } from "viem";
import { prefixHex } from "../utils";
import type { RawLog } from "../types/transaction";
export type { RawLog } from "../types/transaction";

// ---------------------------------------------------------------------------
// Event topic0 constants (keccak256 of canonical signature)
// ---------------------------------------------------------------------------

/**
 * Event topic0 constants (keccak256 of the canonical Solidity signature).
 * Pass to `getLogs({ topics: [Object.values(Topics)] })` to fetch all events.
 */
export const Topics = {
  /** `ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)` */
  ConfidentialTransfer: "0x67500e8d0ed826d2194f514dd0d8124f35648ab6e3fb5e6ed867134cffe661e9",
  /** `Wrapped(uint64 mintAmount, uint256 amountIn, uint256 feeAmount, address indexed to_, uint256 indexed mintTxId)` */
  Wrapped: "0x1f7907f4d84043abe0fb7c74e8865ee5fe93fe4f691c54a7b8fa9d6fb17c7cba",
  /** `UnwrapRequested(address indexed receiver, bytes32 amount)` */
  UnwrapRequested: "0x77d02d353c5629272875d11f1b34ec4c65d7430b075575b78cd2502034c469ee",
  /** `UnwrappedFinalized(bytes32 indexed burntAmountHandle, ...)` */
  UnwrappedFinalized: "0xc64e7c81b18b674fc5b037d8a0041bfe3332d86c780a4688f404ee01fbabb152",
  /** `UnwrappedStarted(bool returnVal, uint256 indexed requestId, ...)` */
  UnwrappedStarted: "0x3838891d4843c6d7f9f494570b6fd8843f4e3c3ddb817c1411760bd31b819806",
} as const;

// ---------------------------------------------------------------------------
// Typed event interfaces
// ---------------------------------------------------------------------------

/** Decoded `ConfidentialTransfer` event — an encrypted token transfer. */
export interface ConfidentialTransferEvent {
  readonly eventName: "ConfidentialTransfer";
  /** Sender address. */
  readonly from: Address;
  /** Receiver address. */
  readonly to: Address;
  /** FHE ciphertext handle for the transferred amount. */
  readonly encryptedAmountHandle: Handle;
}

/** Decoded `Wrapped` event — an ERC-20 shield (wrap) operation. */
export interface WrappedEvent {
  readonly eventName: "Wrapped";
  /** Confidential tokens minted. */
  readonly mintAmount: bigint;
  /** Underlying ERC-20 tokens deposited. */
  readonly amountIn: bigint;
  /** Fee deducted during wrapping. */
  readonly feeAmount: bigint;
  /** Receiver of the minted confidential tokens. */
  readonly to: Address;
  /** On-chain mint transaction ID. */
  readonly mintTxId: bigint;
}

/** Decoded `UnwrapRequested` event — an unshield request submitted. */
export interface UnwrapRequestedEvent {
  readonly eventName: "UnwrapRequested";
  /** Address that will receive the unwrapped ERC-20 tokens. */
  readonly receiver: Address;
  /** FHE ciphertext handle for the requested unshield amount. */
  readonly encryptedAmount: Handle;
}

/** Decoded `UnwrappedFinalized` event — an unshield completed on-chain. */
export interface UnwrappedFinalizedEvent {
  readonly eventName: "UnwrappedFinalized";
  /** FHE handle of the burnt confidential balance. */
  readonly burntAmountHandle: Handle;
  /** Whether the finalization succeeded. */
  readonly finalizeSuccess: boolean;
  /** Whether the fee transfer succeeded. */
  readonly feeTransferSuccess: boolean;
  /** Amount of confidential tokens burnt. */
  readonly burnAmount: bigint;
  /** Amount of underlying ERC-20 tokens returned. */
  readonly unwrapAmount: bigint;
  /** Fee deducted during unwrapping. */
  readonly feeAmount: bigint;
  /** Next on-chain transaction ID. */
  readonly nextTxId: bigint;
}

/** Decoded `UnwrappedStarted` event — the relayer began processing an unshield. */
export interface UnwrappedStartedEvent {
  readonly eventName: "UnwrappedStarted";
  /** Whether the unwrap start succeeded. */
  readonly returnVal: boolean;
  /** On-chain request ID. */
  readonly requestId: bigint;
  /** On-chain transaction ID. */
  readonly txId: bigint;
  /** Receiver address. */
  readonly to: Address;
  /** Refund address (if applicable). */
  readonly refund: Address;
  /** FHE handle of the requested amount. */
  readonly requestedAmount: Handle;
  /** FHE handle of the burn amount. */
  readonly burnAmount: Handle;
}

/** Union of all decoded confidential token event types. */
export type OnChainEvent =
  | ConfidentialTransferEvent
  | WrappedEvent
  | UnwrapRequestedEvent
  | UnwrappedFinalizedEvent
  | UnwrappedStartedEvent;

// ---------------------------------------------------------------------------
// ABI decoding helpers (no external deps)
// ---------------------------------------------------------------------------

function topicToAddress(topic: Hex): Address {
  return getAddress(prefixHex(topic.slice(-40)));
}

function topicToBigInt(topic: Hex): bigint {
  return BigInt(topic);
}

function topicToBytes32(topic: Hex): Handle {
  // EVM topics are already 32-byte 0x-prefixed hex — cast directly
  return topic as Handle;
}

function wordAt(data: Hex, index: number): string {
  // data starts with "0x", each word is 64 hex chars (32 bytes)
  const start = 2 + index * 64;
  const word = data.slice(start, start + 64);
  return word.length === 64 ? word : word.padEnd(64, "0");
}

function wordToAddress(data: Hex, index: number): Address {
  return getAddress(prefixHex(wordAt(data, index).slice(-40)));
}

function wordToBigInt(data: Hex, index: number): bigint {
  return BigInt("0x" + wordAt(data, index));
}

function wordToBool(data: Hex, index: number): boolean {
  return BigInt("0x" + wordAt(data, index)) !== 0n;
}

function wordToBytes32(data: Hex, index: number): Handle {
  // wordAt returns exactly 64 hex chars — prefix and cast directly
  return prefixHex(wordAt(data, index)) as Handle;
}

// ---------------------------------------------------------------------------
// Individual decoders
// ---------------------------------------------------------------------------

/**
 * ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)
 * All 3 params indexed → topics[1..3], no data.
 */
export function decodeConfidentialTransfer(log: RawLog): ConfidentialTransferEvent | null {
  if (log.topics[0] !== Topics.ConfidentialTransfer) {
    return null;
  }
  if (log.topics.length < 4) {
    return null;
  }

  return {
    eventName: "ConfidentialTransfer",
    from: topicToAddress(log.topics[1]!),
    to: topicToAddress(log.topics[2]!),
    encryptedAmountHandle: topicToBytes32(log.topics[3]!),
  };
}

/**
 * Wrapped(uint64 mintAmount, uint256 amountIn, uint256 feeAmount, address indexed to_, uint256 indexed mintTxId)
 * Indexed: to_ (topics[1]), mintTxId (topics[2])
 * Data: mintAmount (uint64, abi-encoded as uint256), amountIn, feeAmount
 */
export function decodeWrapped(log: RawLog): WrappedEvent | null {
  if (log.topics[0] !== Topics.Wrapped) {
    return null;
  }
  if (log.topics.length < 3) {
    return null;
  }

  return {
    eventName: "Wrapped",
    to: topicToAddress(log.topics[1]!),
    mintTxId: topicToBigInt(log.topics[2]!),
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
  if (log.topics[0] !== Topics.UnwrapRequested) {
    return null;
  }
  if (log.topics.length < 2) {
    return null;
  }

  return {
    eventName: "UnwrapRequested",
    receiver: topicToAddress(log.topics[1]!),
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
  if (log.topics[0] !== Topics.UnwrappedFinalized) {
    return null;
  }
  if (log.topics.length < 3) {
    return null;
  }

  return {
    eventName: "UnwrappedFinalized",
    burntAmountHandle: topicToBytes32(log.topics[1]!),
    nextTxId: topicToBigInt(log.topics[2]!),
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
  if (log.topics[0] !== Topics.UnwrappedStarted) {
    return null;
  }
  if (log.topics.length < 4) {
    return null;
  }

  return {
    eventName: "UnwrappedStarted",
    requestId: topicToBigInt(log.topics[1]!),
    txId: topicToBigInt(log.topics[2]!),
    to: topicToAddress(log.topics[3]!),
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
 * const event = decodeOnChainEvent(log);
 * if (event?.eventName === "ConfidentialTransfer") {
 *   console.log(event.from, event.to);
 * }
 * ```
 */
export function decodeOnChainEvent(log: RawLog): OnChainEvent | null {
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
 * const events = decodeOnChainEvents(receipt.logs);
 * ```
 */
export function decodeOnChainEvents(logs: readonly RawLog[]): OnChainEvent[] {
  const events: OnChainEvent[] = [];
  for (const log of logs) {
    const event = decodeOnChainEvent(log);
    if (event) {
      events.push(event);
    }
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
    if (event) {
      return event;
    }
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
    if (event) {
      return event;
    }
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

// ---------------------------------------------------------------------------
// ACL delegation event topic0 constants
// ---------------------------------------------------------------------------

/**
 * ACL delegation event topic0 constants (keccak256 of the canonical Solidity signature).
 * These are ACL events, NOT token events — they are emitted by the ACL contract.
 */
export const AclTopics = {
  /** `DelegatedForUserDecryption(address indexed delegator, address indexed delegate, address contractAddress, uint64 delegationCounter, uint64 oldExpirationDate, uint64 newExpirationDate)` */
  DelegatedForUserDecryption: "0x527b025d7ff06689c1ab9d32dfd7881c964cce72ce8ac5b2fe1d3be8cfda5bfc",
  /** `RevokedDelegationForUserDecryption(address indexed delegator, address indexed delegate, address contractAddress, uint64 delegationCounter, uint64 oldExpirationDate)` */
  RevokedDelegationForUserDecryption:
    "0x7aca80b6b7928b9038f186e3d9922a0fc5d52c398fbf144725c142c52a5277e4",
} as const;

// ---------------------------------------------------------------------------
// ACL delegation event interfaces
// ---------------------------------------------------------------------------

/** Decoded `DelegatedForUserDecryption` event — a delegation was created or renewed. */
export interface DelegatedForUserDecryptionEvent {
  readonly eventName: "DelegatedForUserDecryption";
  /** Address of the delegator (the account granting access). */
  readonly delegator: Address;
  /** Address of the delegate (the account receiving access). */
  readonly delegate: Address;
  /** Contract address the delegation applies to. */
  readonly contractAddress: Address;
  /** Monotonic delegation counter. */
  readonly delegationCounter: bigint;
  /** Previous expiration timestamp (0 if first delegation). */
  readonly oldExpirationDate: bigint;
  /** New expiration timestamp. */
  readonly newExpirationDate: bigint;
}

/** Decoded `RevokedDelegationForUserDecryption` event — a delegation was revoked. */
export interface RevokedDelegationForUserDecryptionEvent {
  readonly eventName: "RevokedDelegationForUserDecryption";
  /** Address of the delegator. */
  readonly delegator: Address;
  /** Address of the delegate. */
  readonly delegate: Address;
  /** Contract address the revocation applies to. */
  readonly contractAddress: Address;
  /** Monotonic delegation counter. */
  readonly delegationCounter: bigint;
  /** Expiration date that was active before revocation. */
  readonly oldExpirationDate: bigint;
}

/** Union of all decoded ACL delegation event types. */
export type AclEvent = DelegatedForUserDecryptionEvent | RevokedDelegationForUserDecryptionEvent;

// ---------------------------------------------------------------------------
// ACL delegation event decoders
// ---------------------------------------------------------------------------

/**
 * DelegatedForUserDecryption(address indexed delegator, address indexed delegate,
 *   address contractAddress, uint64 delegationCounter, uint64 oldExpirationDate, uint64 newExpirationDate)
 * Indexed: delegator (topics[1]), delegate (topics[2])
 * Data: contractAddress, delegationCounter, oldExpirationDate, newExpirationDate
 */
export function decodeDelegatedForUserDecryption(
  log: RawLog,
): DelegatedForUserDecryptionEvent | null {
  if (log.topics[0] !== AclTopics.DelegatedForUserDecryption) {
    return null;
  }
  if (log.topics.length < 3) {
    return null;
  }

  return {
    eventName: "DelegatedForUserDecryption",
    delegator: topicToAddress(log.topics[1]!),
    delegate: topicToAddress(log.topics[2]!),
    contractAddress: wordToAddress(log.data, 0),
    delegationCounter: wordToBigInt(log.data, 1),
    oldExpirationDate: wordToBigInt(log.data, 2),
    newExpirationDate: wordToBigInt(log.data, 3),
  };
}

/**
 * RevokedDelegationForUserDecryption(address indexed delegator, address indexed delegate,
 *   address contractAddress, uint64 delegationCounter, uint64 oldExpirationDate)
 * Indexed: delegator (topics[1]), delegate (topics[2])
 * Data: contractAddress, delegationCounter, oldExpirationDate
 */
export function decodeRevokedDelegationForUserDecryption(
  log: RawLog,
): RevokedDelegationForUserDecryptionEvent | null {
  if (log.topics[0] !== AclTopics.RevokedDelegationForUserDecryption) {
    return null;
  }
  if (log.topics.length < 3) {
    return null;
  }

  return {
    eventName: "RevokedDelegationForUserDecryption",
    delegator: topicToAddress(log.topics[1]!),
    delegate: topicToAddress(log.topics[2]!),
    contractAddress: wordToAddress(log.data, 0),
    delegationCounter: wordToBigInt(log.data, 1),
    oldExpirationDate: wordToBigInt(log.data, 2),
  };
}

/**
 * Try all ACL delegation decoders on a single log and return the first match, or `null`.
 */
export function decodeAclEvent(log: RawLog): AclEvent | null {
  return decodeDelegatedForUserDecryption(log) ?? decodeRevokedDelegationForUserDecryption(log);
}

/**
 * Batch-decode an array of logs for ACL delegation events, skipping unrecognized entries.
 */
export function decodeAclEvents(logs: readonly RawLog[]): AclEvent[] {
  const events: AclEvent[] = [];
  for (const log of logs) {
    const event = decodeAclEvent(log);
    if (event) {
      events.push(event);
    }
  }
  return events;
}

/**
 * Find the first {@link DelegatedForUserDecryptionEvent} in a logs array.
 */
export function findDelegatedForUserDecryption(
  logs: readonly RawLog[],
): DelegatedForUserDecryptionEvent | null {
  for (const log of logs) {
    const event = decodeDelegatedForUserDecryption(log);
    if (event) {
      return event;
    }
  }
  return null;
}

/**
 * Find the first {@link RevokedDelegationForUserDecryptionEvent} in a logs array.
 */
export function findRevokedDelegationForUserDecryption(
  logs: readonly RawLog[],
): RevokedDelegationForUserDecryptionEvent | null {
  for (const log of logs) {
    const event = decodeRevokedDelegationForUserDecryption(log);
    if (event) {
      return event;
    }
  }
  return null;
}

/**
 * Both ACL delegation event topic0 hashes.
 * Pass to `getLogs({ topics: [ACL_TOPICS] })` to fetch
 * all delegation events in a single RPC call.
 */
export const ACL_TOPICS = [
  AclTopics.DelegatedForUserDecryption,
  AclTopics.RevokedDelegationForUserDecryption,
] as const;
