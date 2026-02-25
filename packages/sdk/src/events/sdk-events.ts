import type { Address, Hex } from "../relayer/relayer-sdk.types";

/**
 * All SDK event keys, accessible as `ZamaSDKEvents.EncryptStart` etc.
 */
export const ZamaSDKEvents = {
  // Credentials lifecycle
  CredentialsLoading: "credentials:loading",
  CredentialsCached: "credentials:cached",
  CredentialsExpired: "credentials:expired",
  CredentialsCreating: "credentials:creating",
  CredentialsCreated: "credentials:created",
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
  ApproveSubmitted: "approve:submitted",
  ApproveUnderlyingSubmitted: "approveUnderlying:submitted",
  UnwrapSubmitted: "unwrap:submitted",
  FinalizeUnwrapSubmitted: "finalizeUnwrap:submitted",
  // Unshield orchestration
  UnshieldPhase1Submitted: "unshield:phase1_submitted",
  UnshieldPhase2Started: "unshield:phase2_started",
  UnshieldPhase2Submitted: "unshield:phase2_submitted",
} as const;

/** Union of all SDK event type strings. */
export type ZamaSDKEventType = (typeof ZamaSDKEvents)[keyof typeof ZamaSDKEvents];

// -- Base fields present on every event --

interface BaseEvent {
  tokenAddress?: Address;
  timestamp: number;
  /** Shared identifier linking related events in multi-phase operations (e.g. unshield). */
  operationId?: string;
}

// -- Per-event typed payloads --

export interface CredentialsLoadingEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsLoading;
  /** Contract addresses being requested. */
  contractAddresses?: Address[];
}

export interface CredentialsCachedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsCached;
  /** Contract addresses covered by the cached credentials. */
  contractAddresses?: Address[];
}

export interface CredentialsExpiredEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsExpired;
  /** Contract addresses that need re-authorization. */
  contractAddresses?: Address[];
}

export interface CredentialsCreatingEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsCreating;
  /** Contract addresses being authorized. */
  contractAddresses?: Address[];
}

export interface CredentialsCreatedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsCreated;
  /** Contract addresses covered by the new credentials. */
  contractAddresses?: Address[];
}

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
}

export interface DecryptEndEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptEnd;
  durationMs: number;
}

export interface DecryptErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.DecryptError;
  /** The error that caused the decryption to fail. */
  error: Error;
  durationMs: number;
}

export interface TransactionErrorEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransactionError;
  /** Which write operation failed. */
  operation: string;
  /** The error that caused the transaction to fail. */
  error: Error;
}

export interface ShieldSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.ShieldSubmitted;
  txHash: Hex;
}

export interface TransferSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransferSubmitted;
  txHash: Hex;
}

export interface TransferFromSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.TransferFromSubmitted;
  txHash: Hex;
}

export interface ApproveSubmittedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.ApproveSubmitted;
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

/** Discriminated union of all SDK events. Never contains amounts, private keys, handles, or proofs. */
export type ZamaSDKEvent =
  | CredentialsLoadingEvent
  | CredentialsCachedEvent
  | CredentialsExpiredEvent
  | CredentialsCreatingEvent
  | CredentialsCreatedEvent
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
  | ApproveSubmittedEvent
  | ApproveUnderlyingSubmittedEvent
  | UnwrapSubmittedEvent
  | FinalizeUnwrapSubmittedEvent
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
