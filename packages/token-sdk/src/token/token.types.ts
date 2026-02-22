import type { RawLog } from "../events";
import type { Hex, EIP712TypedData } from "../relayer/relayer-sdk.types";
export type { Hex } from "../relayer/relayer-sdk.types";

/** Framework-agnostic transaction receipt (only the fields the SDK needs). */
export interface TransactionReceipt {
  readonly logs: readonly RawLog[];
}

/** Minimal contract call config (matches contract builder output shape). */
export interface ContractCallConfig {
  readonly address: Hex;
  readonly abi: readonly unknown[];
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
  readonly gas?: bigint;
}

/**
 * Framework-agnostic signer interface.
 * Wallet devs implement this with their library of choice.
 * The React SDK ships pre-built adapters for wagmi/viem/ethers.
 */
export interface GenericSigner {
  /** The connected wallet address. */
  getAddress: () => Promise<Hex>;
  /** Sign EIP-712 typed data (used for decrypt authorization). */
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  /** Send a write transaction and return the tx hash. */
  writeContract<C extends ContractCallConfig>(config: C): Promise<Hex>;
  /** Execute a read-only call and return the decoded result. */
  readContract<T = unknown, C extends ContractCallConfig = ContractCallConfig>(
    config: C,
  ): Promise<T>;
  /** Wait for a transaction to be mined and return its receipt. */
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
}

/** Pluggable key-value store for persisting FHE credentials. */
export interface GenericStringStorage {
  getItem(key: string): string | Promise<string | null> | null;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Stored credential data (serialized as JSON in CredentialStore). */
export interface StoredCredentials {
  publicKey: string;
  privateKey: string;
  signature: string;
  contractAddresses: Hex[];
  startTimestamp: number;
  durationDays: number;
}

export const TokenErrorCode = {
  SigningRejected: "SIGNING_REJECTED",
  SigningFailed: "SIGNING_FAILED",
  EncryptionFailed: "ENCRYPTION_FAILED",
  DecryptionFailed: "DECRYPTION_FAILED",
  NotConfidential: "NOT_CONFIDENTIAL",
  NotWrapper: "NOT_WRAPPER",
  ApprovalFailed: "APPROVAL_FAILED",
  TransactionReverted: "TRANSACTION_REVERTED",
  StoreError: "STORE_ERROR",
} as const;

export type TokenErrorCode = (typeof TokenErrorCode)[keyof typeof TokenErrorCode];

export class TokenError extends Error {
  readonly code: TokenErrorCode;

  constructor(code: TokenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TokenError";
    this.code = code;
  }
}
