/**
 * Framework-agnostic event decoders for confidential token contracts.
 * Works with raw log data from any provider.
 */

import type { Handle } from "../relayer/relayer-sdk.types";
import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { prefixHex } from "../utils";
import type { RawLog } from "../types/transaction";
export type { RawLog } from "../types/transaction";

function eventTopic(signature: string): Hex {
  return keccak256(toBytes(signature));
}

// ---------------------------------------------------------------------------
// Event topic0 constants (keccak256 of canonical signature)
// ---------------------------------------------------------------------------

/**
 * Event topic0 constants (keccak256 of the canonical Solidity signature).
 * Pass to `getLogs({ topics: [Object.values(Topics)] })` to fetch all events.
 */
export const Topics = {
  /** `ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)` */
  ConfidentialTransfer: eventTopic("ConfidentialTransfer(address,address,bytes32)"),
  // NOTE: New wrapper contracts no longer emit Wrapped — shields now emit
  // ConfidentialTransfer(from=zeroAddress, ...) instead. Retained for backward
  // compatibility with older deployments.
  /** `Wrapped(address indexed to, uint256 amountIn)` */
  Wrapped: eventTopic("Wrapped(address,uint256)"),
  /** `UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)` */
  UnwrapRequested: eventTopic("UnwrapRequested(address,bytes32,bytes32)"),
  /** `UnwrapRequested(address indexed receiver, bytes32 amount)` */
  UnwrapRequestedLegacy: eventTopic("UnwrapRequested(address,bytes32)"),
  /** `UnwrapFinalized(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 encryptedAmount, uint64 cleartextAmount)` */
  UnwrapFinalized: eventTopic("UnwrapFinalized(address,bytes32,bytes32,uint64)"),
  /** `UnwrapFinalized(address indexed receiver, bytes32 encryptedAmount, uint64 cleartextAmount)` */
  UnwrapFinalizedLegacy: eventTopic("UnwrapFinalized(address,bytes32,uint64)"),
  /** @deprecated Use `Topics.UnwrapFinalized`. */
  UnwrappedFinalized: eventTopic("UnwrapFinalized(address,bytes32,bytes32,uint64)"),
  /** `UnwrappedStarted(bool returnVal, uint256 indexed requestId, ...)` */
  UnwrappedStarted: eventTopic(
    "UnwrappedStarted(bool,uint256,uint256,address,address,bytes32,bytes32)",
  ),
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

// NOTE: New wrapper contracts no longer emit this event — shields now emit
// ConfidentialTransfer(from=zeroAddress, ...) instead. Retained for backward
// compatibility with older deployments.
/** Decoded `Wrapped` event — an ERC-20 shield (wrap) operation. */
export interface WrappedEvent {
  readonly eventName: "Wrapped";
  /** Receiver of the minted confidential tokens. */
  readonly to: Address;
  /** Underlying ERC-20 tokens deposited. */
  readonly amountIn: bigint;
}

/** Decoded `UnwrapRequested` event — an unshield request submitted. */
export interface UnwrapRequestedEvent {
  readonly eventName: "UnwrapRequested";
  /** Address that will receive the unwrapped ERC-20 tokens. */
  readonly receiver: Address;
  /** FHE ciphertext handle for the requested unshield amount. */
  readonly encryptedAmount: Handle;
  /** Request identifier emitted by upgraded wrapper contracts. */
  readonly unwrapRequestId?: Handle;
}

/** Decoded `UnwrapFinalized` event — an unshield completed on-chain. */
export interface UnwrapFinalizedEvent {
  readonly eventName: "UnwrapFinalized";
  /** Address receiving the unwrapped ERC-20 tokens. */
  readonly receiver: Address;
  /** FHE ciphertext handle of the burnt confidential balance. */
  readonly encryptedAmount: Handle;
  /** Cleartext amount of underlying ERC-20 tokens returned. */
  readonly cleartextAmount: bigint;
  /** Request identifier emitted by upgraded wrapper contracts. */
  readonly unwrapRequestId?: Handle;
}

/** @deprecated Use `UnwrapFinalizedEvent`. */
export interface UnwrappedFinalizedEvent {
  readonly eventName: "UnwrappedFinalized";
  readonly receiver: Address;
  readonly encryptedAmount: Handle;
  readonly cleartextAmount: bigint;
  readonly unwrapRequestId?: Handle;
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
  | UnwrapFinalizedEvent
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

// NOTE: New wrapper contracts no longer emit this event. Retained for backward
// compatibility with older deployments.
/**
 * Wrapped(address indexed to, uint256 amountIn)
 * Indexed: to (topics[1])
 * Data: amountIn (uint256)
 */
export function decodeWrapped(log: RawLog): WrappedEvent | null {
  if (log.topics[0] !== Topics.Wrapped) {
    return null;
  }
  if (log.topics.length < 2) {
    return null;
  }

  return {
    eventName: "Wrapped",
    to: topicToAddress(log.topics[1]!),
    amountIn: wordToBigInt(log.data, 0),
  };
}

/**
 * UnwrapRequested(address indexed receiver, bytes32 amount)
 * UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)
 */
export function decodeUnwrapRequested(log: RawLog): UnwrapRequestedEvent | null {
  if (log.topics[0] === Topics.UnwrapRequested) {
    if (log.topics.length < 3) {
      return null;
    }

    return {
      eventName: "UnwrapRequested",
      receiver: topicToAddress(log.topics[1]!),
      unwrapRequestId: topicToBytes32(log.topics[2]!),
      encryptedAmount: wordToBytes32(log.data, 0),
    };
  }

  if (log.topics[0] === Topics.UnwrapRequestedLegacy) {
    if (log.topics.length < 2) {
      return null;
    }

    return {
      eventName: "UnwrapRequested",
      receiver: topicToAddress(log.topics[1]!),
      encryptedAmount: wordToBytes32(log.data, 0),
    };
  }

  return null;
}

/**
 * UnwrapFinalized(address indexed receiver, bytes32 encryptedAmount, uint64 cleartextAmount)
 * UnwrapFinalized(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 encryptedAmount, uint64 cleartextAmount)
 */
export function decodeUnwrapFinalized(log: RawLog): UnwrapFinalizedEvent | null {
  if (log.topics[0] === Topics.UnwrapFinalized || log.topics[0] === Topics.UnwrappedFinalized) {
    if (log.topics.length < 3) {
      return null;
    }

    return {
      eventName: "UnwrapFinalized",
      receiver: topicToAddress(log.topics[1]!),
      unwrapRequestId: topicToBytes32(log.topics[2]!),
      encryptedAmount: wordToBytes32(log.data, 0),
      cleartextAmount: wordToBigInt(log.data, 1),
    };
  }

  if (log.topics[0] === Topics.UnwrapFinalizedLegacy) {
    if (log.topics.length < 2) {
      return null;
    }

    return {
      eventName: "UnwrapFinalized",
      receiver: topicToAddress(log.topics[1]!),
      encryptedAmount: wordToBytes32(log.data, 0),
      cleartextAmount: wordToBigInt(log.data, 1),
    };
  }

  return null;
}

/** @deprecated Use `decodeUnwrapFinalized`. */
export function decodeUnwrappedFinalized(log: RawLog): UnwrappedFinalizedEvent | null {
  const event = decodeUnwrapFinalized(log);
  if (!event) {
    return null;
  }

  return {
    ...event,
    eventName: "UnwrappedFinalized",
  };
}

function decodeLegacyUnwrappedFinalized(log: RawLog): UnwrappedFinalizedEvent | null {
  if (log.topics[0] !== Topics.UnwrapFinalizedLegacy) {
    return null;
  }
  const event = decodeUnwrapFinalized(log);
  if (!event) {
    return null;
  }

  return {
    ...event,
    eventName: "UnwrappedFinalized",
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
    decodeLegacyUnwrappedFinalized(log) ??
    decodeUnwrapFinalized(log) ??
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

// NOTE: New wrapper contracts no longer emit this event. Retained for backward
// compatibility with older deployments.
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
 * All confidential token event topic0 hashes.
 * Pass to `getLogs({ topics: [TOKEN_TOPICS] })` to fetch
 * all confidential token events in a single RPC call.
 */
export const TOKEN_TOPICS = [
  Topics.ConfidentialTransfer,
  Topics.Wrapped,
  Topics.UnwrapRequested,
  Topics.UnwrapRequestedLegacy,
  Topics.UnwrapFinalized,
  Topics.UnwrapFinalizedLegacy,
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
  DelegatedForUserDecryption: eventTopic(
    "DelegatedForUserDecryption(address,address,address,uint64,uint64,uint64)",
  ),
  /** `RevokedDelegationForUserDecryption(address indexed delegator, address indexed delegate, address contractAddress, uint64 delegationCounter, uint64 oldExpirationDate)` */
  RevokedDelegationForUserDecryption: eventTopic(
    "RevokedDelegationForUserDecryption(address,address,address,uint64,uint64)",
  ),
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
