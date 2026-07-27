import type { Address, Hex } from "viem";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import type { ShieldPath } from "../types/token";

/**
 * All SDK event keys, accessible as `ZamaSDKEvents.EncryptStart` etc.
 */
export const ZamaSDKEvents = {
  // FHE operations
  EncryptStart: "encrypt:start",
  EncryptEnd: "encrypt:end",
  EncryptError: "encrypt:error",
  DecryptStart: "decrypt:start",
  DecryptEnd: "decrypt:end",
  DecryptError: "decrypt:error",
  // Write operations
  TransactionError: "transaction:error",
  ShieldSubmitted: "shield:submitted",
  TransferSubmitted: "transfer:submitted",
  TransferFromSubmitted: "transferFrom:submitted",
  SetOperatorSubmitted: "setOperator:submitted",
  ApproveUnderlyingSubmitted: "approveUnderlying:submitted",
  WrapSubmitted: "wrap:submitted",
  UnwrapSubmitted: "unwrap:submitted",
  FinalizeUnwrapSubmitted: "finalizeUnwrap:submitted",
  // Delegation operations
  DelegationSubmitted: "delegation:submitted",
  RevokeDelegationSubmitted: "revokeDelegation:submitted",
  // Unshield orchestration
  UnshieldPhase1Submitted: "unshield:phase1_submitted",
  UnshieldPhase2Started: "unshield:phase2_started",
  UnshieldPhase2Submitted: "unshield:phase2_submitted",
} as const;

/** Union of all SDK event type strings. */
export type ZamaSDKEventType = (typeof ZamaSDKEvents)[keyof typeof ZamaSDKEvents];

// -- Base fields present on every event --

/** Fields present on every SDK event; each concrete event extends this. */
export interface BaseEvent {
  /** Confidential token this event relates to, when the operation targets one. */
  tokenAddress?: Address;
  /** Unix epoch time (milliseconds) at which the event was emitted. */
  timestamp: number;
  /** Shared identifier linking related events in multi-phase operations (e.g. unshield). */
  operationId?: string;
}

// -- Per-event typed payloads --

/** Emitted when an FHE encryption starts. */
export interface EncryptStartEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.EncryptStart;
}

/** Emitted when an FHE encryption completes successfully. */
export interface EncryptEndEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.EncryptEnd;
  /** Time the encryption took, in milliseconds. */
  durationMs: number;
}

/** Emitted when an FHE encryption fails. */
export interface EncryptErrorEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.EncryptError;
  /** The error that caused the encryption to fail. */
  error: Error;
  /** Time elapsed before the encryption failed, in milliseconds. */
  durationMs: number;
}

/** Emitted when an FHE decryption starts. */
export interface DecryptStartEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.DecryptStart;
  /** Encrypted values being decrypted — correlate with matching DecryptEnd/DecryptError. */
  encryptedValues: EncryptedValue[];
}

/** Emitted when an FHE decryption completes successfully. */
export interface DecryptEndEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.DecryptEnd;
  /** Time the decryption took, in milliseconds. */
  durationMs: number;
  /** Encrypted values that were decrypted. */
  encryptedValues: EncryptedValue[];
  /** Decrypted values keyed by encrypted value — use this to correlate events to specific entries. */
  result: Record<EncryptedValue, ClearValue>;
}

/** Emitted when an FHE decryption fails. */
export interface DecryptErrorEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.DecryptError;
  /** The error that caused the decryption to fail. */
  error: Error;
  /** Time elapsed before the decryption failed, in milliseconds. */
  durationMs: number;
  /** Encrypted values that were being decrypted when the error occurred. */
  encryptedValues: EncryptedValue[];
}

/** Emitted when a write operation's transaction fails (before or after submission). */
export interface TransactionErrorEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.TransactionError;
  /** Which SDK operation failed. */
  operation: TransactionOperation;
  /** The error that caused the transaction to fail. */
  error: Error;
}

/** Emitted when a shield transaction has been submitted to the network. */
export interface ShieldSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.ShieldSubmitted;
  /** Hash of the submitted shield transaction. */
  txHash: Hex;
  /** Which execution path was used: single-tx `transferAndCall` or two-tx `approveAndWrap`. */
  shieldPath: ShieldPath;
}

/** Emitted when a confidential transfer transaction has been submitted to the network. */
export interface TransferSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.TransferSubmitted;
  /** Hash of the submitted transfer transaction. */
  txHash: Hex;
}

/** Emitted when a confidential `transferFrom` transaction has been submitted to the network. */
export interface TransferFromSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.TransferFromSubmitted;
  /** Hash of the submitted transferFrom transaction. */
  txHash: Hex;
}

/** Emitted when a set-operator transaction has been submitted to the network. */
export interface SetOperatorSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.SetOperatorSubmitted;
  /** Hash of the submitted setOperator transaction. */
  txHash: Hex;
}

/** Emitted when an underlying-ERC-20 approval transaction has been submitted to the network. */
export interface ApproveUnderlyingSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.ApproveUnderlyingSubmitted;
  /** Hash of the submitted approval transaction. */
  txHash: Hex;
  /** Which approval transaction was submitted. */
  step: "reset" | "approve";
}

/**
 * Emitted by the standalone `wrap()` escape hatch (not by `shield()`, which
 * emits {@link ShieldSubmittedEvent}). Distinct so a caller-initiated `wrap`
 * isn't conflated with `shield()`'s internal `approveAndWrap` leg — mirroring
 * how `unwrap` emits its own event rather than reusing the unshield phases.
 */
export interface WrapSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.WrapSubmitted;
  /** Hash of the submitted wrap transaction. */
  txHash: Hex;
}

/** Emitted when an unwrap transaction has been submitted to the network. */
export interface UnwrapSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.UnwrapSubmitted;
  /** Hash of the submitted unwrap transaction. */
  txHash: Hex;
}

/** Emitted when a finalize-unwrap transaction has been submitted to the network. */
export interface FinalizeUnwrapSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.FinalizeUnwrapSubmitted;
  /** Hash of the submitted finalizeUnwrap transaction. */
  txHash: Hex;
}

/** Emitted when a decryption-delegation transaction has been submitted to the network. */
export interface DelegationSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.DelegationSubmitted;
  /** Hash of the submitted delegation transaction. */
  txHash: Hex;
}

/** Emitted when a revoke-delegation transaction has been submitted to the network. */
export interface RevokeDelegationSubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.RevokeDelegationSubmitted;
  /** Hash of the submitted revokeDelegation transaction. */
  txHash: Hex;
}

/** Emitted when the first phase of an unshield (the unwrap request) has been submitted. */
export interface UnshieldPhase1SubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.UnshieldPhase1Submitted;
  /** Hash of the submitted phase-1 transaction. */
  txHash: Hex;
}

/** Emitted when the second phase of an unshield (finalization) starts. */
export interface UnshieldPhase2StartedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.UnshieldPhase2Started;
}

/** Emitted when the second phase of an unshield (finalization) has been submitted. */
export interface UnshieldPhase2SubmittedEvent extends BaseEvent {
  /** Event type discriminant. */
  type: typeof ZamaSDKEvents.UnshieldPhase2Submitted;
  /** Hash of the submitted phase-2 transaction. */
  txHash: Hex;
}

/**
 * Discriminated union of all SDK events.
 *
 * Decrypt events carry encrypted values and decrypted clear-text values so event
 * subscribers can correlate and bind them in UI layers. Events never carry
 * private keys, permit signatures, or ZK proofs.
 */
export type ZamaSDKEvent =
  | EncryptStartEvent
  | EncryptEndEvent
  | EncryptErrorEvent
  | DecryptStartEvent
  | DecryptEndEvent
  | DecryptErrorEvent
  | TransactionErrorEvent
  | ShieldSubmittedEvent
  | TransferSubmittedEvent
  | TransferFromSubmittedEvent
  | SetOperatorSubmittedEvent
  | ApproveUnderlyingSubmittedEvent
  | WrapSubmittedEvent
  | UnwrapSubmittedEvent
  | FinalizeUnwrapSubmittedEvent
  | DelegationSubmittedEvent
  | RevokeDelegationSubmittedEvent
  | UnshieldPhase1SubmittedEvent
  | UnshieldPhase2StartedEvent
  | UnshieldPhase2SubmittedEvent;

/** Callback invoked with each emitted {@link ZamaSDKEvent}. */
export type ZamaSDKEventListener = (event: ZamaSDKEvent) => void;

/**
 * Distributive Omit that preserves the discriminated union. Internal emit-side
 * shape — consumers only ever receive fully-populated {@link ZamaSDKEvent}.
 * @internal
 */
export type ZamaSDKEventInput = ZamaSDKEvent extends infer E
  ? E extends ZamaSDKEvent
    ? Omit<E, "timestamp" | "tokenAddress">
    : never
  : never;

/**
 * SDK transaction operations that emit submitted/error lifecycle events.
 *
 * Operation strings encode the execution-path discriminator for flows that have
 * one (`shield:transferAndCall` vs. `shield:approveAndWrap`), routing both error
 * and success events on a single field — see {@link transactionOperationMetadata}.
 */
export type TransactionOperation =
  | "approveUnderlying"
  | "approveUnderlying:reset"
  | "delegateDecryption"
  | "finalizeUnwrap"
  | "revokeDelegation"
  | "setOperator"
  | "shield:transferAndCall"
  | "shield:approveAndWrap"
  | "wrap"
  | "transfer"
  | "transferAndCall"
  | "transferFrom"
  | "transferFromAndCall"
  | "unwrap"
  | "unwrapAll";

/**
 * Single source of truth for each transaction operation's submitted-event payload.
 *
 * Adding a write op = adding one entry here plus its {@link TransactionOperation}
 * member; the `satisfies Record<TransactionOperation, …>` check enforces that the
 * table and the union stay in lockstep (missing or extra keys fail the build) and
 * that every entry produces a valid {@link ZamaSDKEventInput}.
 *
 * @internal
 */
export const transactionOperationMetadata = {
  approveUnderlying: {
    submittedEvent: (txHash: Hex) => ({
      type: ZamaSDKEvents.ApproveUnderlyingSubmitted,
      txHash,
      step: "approve" as const,
    }),
  },
  "approveUnderlying:reset": {
    submittedEvent: (txHash: Hex) => ({
      type: ZamaSDKEvents.ApproveUnderlyingSubmitted,
      txHash,
      step: "reset" as const,
    }),
  },
  delegateDecryption: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.DelegationSubmitted, txHash }),
  },
  finalizeUnwrap: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.FinalizeUnwrapSubmitted, txHash }),
  },
  revokeDelegation: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.RevokeDelegationSubmitted, txHash }),
  },
  setOperator: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.SetOperatorSubmitted, txHash }),
  },
  "shield:transferAndCall": {
    submittedEvent: (txHash: Hex) => ({
      type: ZamaSDKEvents.ShieldSubmitted,
      txHash,
      shieldPath: "transferAndCall" as const,
    }),
  },
  "shield:approveAndWrap": {
    submittedEvent: (txHash: Hex) => ({
      type: ZamaSDKEvents.ShieldSubmitted,
      txHash,
      shieldPath: "approveAndWrap" as const,
    }),
  },
  wrap: { submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.WrapSubmitted, txHash }) },
  transfer: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.TransferSubmitted, txHash }),
  },
  transferAndCall: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.TransferSubmitted, txHash }),
  },
  transferFrom: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.TransferFromSubmitted, txHash }),
  },
  transferFromAndCall: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.TransferFromSubmitted, txHash }),
  },
  unwrap: { submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.UnwrapSubmitted, txHash }) },
  unwrapAll: { submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.UnwrapSubmitted, txHash }) },
} satisfies Record<TransactionOperation, { submittedEvent: (txHash: Hex) => ZamaSDKEventInput }>;
