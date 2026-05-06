import type { Address, Hex } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
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
  handles: Handle[];
}

export interface DecryptEndEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptEnd;
  durationMs: number;
  /** Handles that were decrypted. */
  handles: Handle[];
  /** Decrypted values keyed by handle — use this to correlate events to specific handles. */
  result: Record<Handle, ClearValueType>;
}

export interface DecryptErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptError;
  /** The error that caused the decryption to fail. */
  error: Error;
  durationMs: number;
  /** Handles that were being decrypted when the error occurred. */
  handles: Handle[];
}

/**
 * Identifier for the SDK operation that emitted a {@link TransactionErrorEvent}.
 * Shield failures encode the execution path in the operation string itself
 * (`shield:transferAndCall` or `shield:approveAndWrap`) so observers can route
 * on a single field.
 */
export type TransactionErrorOperation =
  | "approveUnderlying"
  | "delegateDecryption"
  | "finalizeUnwrap"
  | "revokeDelegation"
  | "setOperator"
  | "shield:transferAndCall"
  | "shield:approveAndWrap"
  | "transfer"
  | "transferFrom"
  | "unwrap";

export interface TransactionErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransactionError;
  /** Which SDK operation failed. */
  operation: TransactionErrorOperation;
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
