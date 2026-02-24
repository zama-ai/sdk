import type { Address, Hex } from "../relayer/relayer-sdk.types";

/**
 * All SDK event keys, accessible as `TokenSDKEvents.EncryptStart` etc.
 */
export const TokenSDKEvents = {
  // Credentials lifecycle
  CredentialsLoading: "credentials:loading",
  CredentialsCached: "credentials:cached",
  CredentialsExpired: "credentials:expired",
  CredentialsCreating: "credentials:creating",
  CredentialsCreated: "credentials:created",
  // FHE operations
  EncryptStart: "encrypt:start",
  EncryptEnd: "encrypt:end",
  DecryptStart: "decrypt:start",
  DecryptEnd: "decrypt:end",
  // Write operations
  WrapSubmitted: "wrap:submitted",
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
export type TokenSDKEventType = (typeof TokenSDKEvents)[keyof typeof TokenSDKEvents];

// -- Base fields present on every event --

interface BaseEvent {
  tokenAddress?: Address;
  timestamp: number;
}

// -- Per-event typed payloads --

export interface CredentialsLoadingEvent extends BaseEvent {
  type: typeof TokenSDKEvents.CredentialsLoading;
}

export interface CredentialsCachedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.CredentialsCached;
}

export interface CredentialsExpiredEvent extends BaseEvent {
  type: typeof TokenSDKEvents.CredentialsExpired;
}

export interface CredentialsCreatingEvent extends BaseEvent {
  type: typeof TokenSDKEvents.CredentialsCreating;
}

export interface CredentialsCreatedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.CredentialsCreated;
}

export interface EncryptStartEvent extends BaseEvent {
  type: typeof TokenSDKEvents.EncryptStart;
}

export interface EncryptEndEvent extends BaseEvent {
  type: typeof TokenSDKEvents.EncryptEnd;
  durationMs?: number;
}

export interface DecryptStartEvent extends BaseEvent {
  type: typeof TokenSDKEvents.DecryptStart;
}

export interface DecryptEndEvent extends BaseEvent {
  type: typeof TokenSDKEvents.DecryptEnd;
  durationMs?: number;
}

export interface WrapSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.WrapSubmitted;
  txHash: Hex;
}

export interface TransferSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.TransferSubmitted;
  txHash: Hex;
}

export interface TransferFromSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.TransferFromSubmitted;
  txHash: Hex;
}

export interface ApproveSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.ApproveSubmitted;
  txHash: Hex;
}

export interface ApproveUnderlyingSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.ApproveUnderlyingSubmitted;
  txHash: Hex;
}

export interface UnwrapSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.UnwrapSubmitted;
  txHash: Hex;
}

export interface FinalizeUnwrapSubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.FinalizeUnwrapSubmitted;
  txHash: Hex;
}

export interface UnshieldPhase1SubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.UnshieldPhase1Submitted;
  txHash: Hex;
}

export interface UnshieldPhase2StartedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.UnshieldPhase2Started;
}

export interface UnshieldPhase2SubmittedEvent extends BaseEvent {
  type: typeof TokenSDKEvents.UnshieldPhase2Submitted;
  txHash: Hex;
}

/** Discriminated union of all SDK events. Never contains amounts, private keys, handles, or proofs. */
export type TokenSDKEvent =
  | CredentialsLoadingEvent
  | CredentialsCachedEvent
  | CredentialsExpiredEvent
  | CredentialsCreatingEvent
  | CredentialsCreatedEvent
  | EncryptStartEvent
  | EncryptEndEvent
  | DecryptStartEvent
  | DecryptEndEvent
  | WrapSubmittedEvent
  | TransferSubmittedEvent
  | TransferFromSubmittedEvent
  | ApproveSubmittedEvent
  | ApproveUnderlyingSubmittedEvent
  | UnwrapSubmittedEvent
  | FinalizeUnwrapSubmittedEvent
  | UnshieldPhase1SubmittedEvent
  | UnshieldPhase2StartedEvent
  | UnshieldPhase2SubmittedEvent;

export type TokenSDKEventListener = (event: TokenSDKEvent) => void;

/** Distributive Omit that preserves the discriminated union. */
export type TokenSDKEventInput = TokenSDKEvent extends infer E
  ? E extends TokenSDKEvent
    ? Omit<E, "timestamp" | "tokenAddress">
    : never
  : never;
