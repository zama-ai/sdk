import type { Address } from "viem";

/** Visibility category for a field in a clear-signing intent. */
export type ClearSigningVisibility = "public" | "encrypted" | "derived" | "internal";

/** Supported clear-signing intent kinds. */
export type ClearSigningIntentKind =
  | "allow"
  | "allowAs"
  | "delegateDecryption"
  | "confidentialTransfer"
  | "confidentialTransferFrom"
  | "shield"
  | "unwrap"
  | "unwrapAll"
  | "finalizeUnwrap";

/** JSON-like value that can be attached to a clear-signing field. */
export type ClearSigningFieldValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | readonly ClearSigningFieldValue[]
  | { readonly [key: string]: ClearSigningFieldValue };

/** Human-readable field with explicit visibility semantics. */
export interface ClearSigningField {
  /** User-facing field label. */
  label: string;
  /** Visibility classification that controls how the field can be rendered. */
  visibility: ClearSigningVisibility;
  /** Structured value for consumers that need machine-readable context. */
  value?: ClearSigningFieldValue;
  /** Conservative display value for user-facing rendering. */
  displayValue?: string;
  /** Optional explanation for advanced renderers. */
  description?: string;
  /** Whether the raw value is intentionally withheld from normal rendering. */
  redacted?: boolean;
}

/** Contract-level context for a clear-signing intent. */
export interface ClearSigningContractContext {
  /** Chain ID associated with the intent, when known. */
  chainId?: number;
  /** Contract address most closely associated with the user-visible action. */
  contractAddress?: Address;
  /** Contract function name most closely associated with the user-visible action. */
  functionName?: string;
}

/** Raw SDK context preserved for advanced consumers and descriptor generation. */
export interface ClearSigningRawContext {
  /** Single contract call config associated with the intent. */
  contractCall?: unknown;
  /** Multiple contract call configs associated with a multi-step intent. */
  contractCalls?: readonly unknown[];
  /** EIP-712 typed data associated with the intent. */
  typedData?: unknown;
  /** Original SDK inputs associated with the intent. */
  sdkInput?: unknown;
}

/** Wallet-agnostic semantic description of a confidential SDK interaction. */
export interface ClearSigningIntent {
  /** Stable intent kind. */
  kind: ClearSigningIntentKind;
  /** Short user-facing title. */
  title: string;
  /** One-sentence user-facing summary. */
  summary: string;
  /** User-facing and advanced fields with explicit visibility semantics. */
  fields: ClearSigningField[];
  /** Contract-level context for wallet or descriptor integrations. */
  contractContext?: ClearSigningContractContext;
  /** Raw context that must remain available without becoming primary wording. */
  rawContext?: ClearSigningRawContext;
}

/** Opaque encrypted value reference with an optional safe display label. */
export interface ClearSigningEncryptedValue {
  /** Opaque encrypted handle or identifier. */
  value?: string;
  /** Safe display string, for example "Hidden encrypted amount". */
  displayValue?: string;
}
