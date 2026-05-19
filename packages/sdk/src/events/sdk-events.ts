import type { Address, Hex } from "viem";
import type { ClearValueType, EncryptedValue } from "../relayer/relayer-sdk.types";
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

export interface BaseEvent {
  tokenAddress?: Address;
  timestamp: number;
  /** Shared identifier linking related events in multi-phase operations (e.g. unshield). */
  operationId?: string;
}

// -- Per-event typed payloads --

export interface EncryptStartEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.EncryptStart;
}

export interface EncryptEndEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.EncryptEnd;
  durationMs: number;
}

export interface EncryptErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.EncryptError;
  /** The error that caused the encryption to fail. */
  error: Error;
  durationMs: number;
}

export interface DecryptStartEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptStart;
  /** Handles being decrypted — correlate with matching DecryptEnd/DecryptError. */
  handles: EncryptedValue[];
}

export interface DecryptEndEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptEnd;
  durationMs: number;
  /** Handles that were decrypted. */
  handles: EncryptedValue[];
  /** Decrypted values keyed by handle — use this to correlate events to specific handles. */
  result: Record<EncryptedValue, ClearValueType>;
}

export interface DecryptErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptError;
  /** The error that caused the decryption to fail. */
  error: Error;
  durationMs: number;
  /** Handles that were being decrypted when the error occurred. */
  handles: EncryptedValue[];
}

export interface TransactionErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransactionError;
  /** Which SDK operation failed. */
  operation: TransactionOperation;
  /** The error that caused the transaction to fail. */
  error: Error;
}

export interface ShieldSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.ShieldSubmitted;
  txHash: Hex;
  /** Which execution path was used: single-tx `transferAndCall` or two-tx `approveAndWrap`. */
  shieldPath: ShieldPath;
}

export interface TransferSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransferSubmitted;
  txHash: Hex;
}

export interface TransferFromSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransferFromSubmitted;
  txHash: Hex;
}

export interface SetOperatorSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.SetOperatorSubmitted;
  txHash: Hex;
}

export interface ApproveUnderlyingSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.ApproveUnderlyingSubmitted;
  txHash: Hex;
  /** Which approval transaction was submitted. */
  step: "reset" | "approve";
}

export interface UnwrapSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.UnwrapSubmitted;
  txHash: Hex;
}

export interface FinalizeUnwrapSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.FinalizeUnwrapSubmitted;
  txHash: Hex;
}

export interface DelegationSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DelegationSubmitted;
  txHash: Hex;
}

export interface RevokeDelegationSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.RevokeDelegationSubmitted;
  txHash: Hex;
}

export interface UnshieldPhase1SubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.UnshieldPhase1Submitted;
  txHash: Hex;
}

export interface UnshieldPhase2StartedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.UnshieldPhase2Started;
}

export interface UnshieldPhase2SubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.UnshieldPhase2Submitted;
  txHash: Hex;
}

/**
 * Discriminated union of all SDK events.
 *
 * Decrypt events carry handles and decrypted clear-text values so event
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
  | UnwrapSubmittedEvent
  | FinalizeUnwrapSubmittedEvent
  | DelegationSubmittedEvent
  | RevokeDelegationSubmittedEvent
  | UnshieldPhase1SubmittedEvent
  | UnshieldPhase2StartedEvent
  | UnshieldPhase2SubmittedEvent;

export type ZamaSDKEventListener = (event: ZamaSDKEvent) => void;

/** Distributive Omit that preserves the discriminated union. */
export type ZamaSDKEventInput = ZamaSDKEvent extends infer E
  ? E extends ZamaSDKEvent
    ? Omit<E, "timestamp" | "tokenAddress">
    : never
  : never;

/**
 * Single source of truth for each transaction operation's submitted-event payload.
 *
 * Adding a write op = adding one entry here. `TransactionOperation` is then
 * `keyof typeof transactionOperationMetadata`, so the dispatch table and the
 * operation union cannot drift.
 *
 * The `satisfies` check enforces that every entry produces a valid
 * {@link ZamaSDKEventInput}.
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
  transfer: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.TransferSubmitted, txHash }),
  },
  transferFrom: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.TransferFromSubmitted, txHash }),
  },
  unwrap: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.UnwrapSubmitted, txHash }),
  },
  unwrapAll: {
    submittedEvent: (txHash: Hex) => ({ type: ZamaSDKEvents.UnwrapSubmitted, txHash }),
  },
} satisfies Record<string, { submittedEvent: (txHash: Hex) => ZamaSDKEventInput }>;

/**
 * SDK transaction operations that emit submitted/error lifecycle events.
 *
 * Operation strings encode the execution-path discriminator for flows that have
 * one (`shield:transferAndCall` vs. `shield:approveAndWrap`), routing both error
 * and success events on a single field — see {@link transactionOperationMetadata}.
 */
export type TransactionOperation = keyof typeof transactionOperationMetadata;
