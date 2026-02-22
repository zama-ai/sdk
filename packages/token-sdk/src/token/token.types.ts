import type { RawLog } from "../events";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
export type { Address } from "../relayer/relayer-sdk.types";

/** Framework-agnostic transaction receipt (only the fields the SDK needs). */
export interface TransactionReceipt {
  /** Event logs emitted during the transaction. */
  readonly logs: readonly RawLog[];
}

/**
 * Minimal contract call configuration.
 * Matches the shape returned by contract call builder functions in `src/contracts/`.
 */
export interface ContractCallConfig {
  /** Target contract address. */
  readonly address: Address;
  /** ABI fragment for the function being called. */
  readonly abi: readonly unknown[];
  /** Solidity function name. */
  readonly functionName: string;
  /** Encoded function arguments. */
  readonly args: readonly unknown[];
  /** Native value to send with the transaction (for payable functions). */
  readonly value?: bigint;
  /** Gas limit override. */
  readonly gas?: bigint;
}

/**
 * Framework-agnostic signer interface.
 * Wallet devs implement this with their library of choice.
 * The React SDK ships pre-built adapters for wagmi/viem/ethers.
 */
export interface GenericSigner {
  /** Return the chain ID of the connected network. */
  getChainId(): Promise<number>;
  /** The connected wallet address. */
  getAddress: () => Promise<Address>;
  /** Sign EIP-712 typed data (used for decrypt authorization). */
  signTypedData(typedData: EIP712TypedData): Promise<Address>;
  /** Send a write transaction and return the tx hash. */
  writeContract<C extends ContractCallConfig>(config: C): Promise<Address>;
  /** Execute a read-only call and return the decoded result. */
  readContract<T = unknown, C extends ContractCallConfig = ContractCallConfig>(
    config: C,
  ): Promise<T>;
  /** Wait for a transaction to be mined and return its receipt. */
  waitForTransactionReceipt(hash: Address): Promise<TransactionReceipt>;
}

/** Pluggable key-value store for persisting FHE credentials. */
export interface GenericStringStorage {
  getItem(key: string): string | Promise<string | null> | null;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Stored FHE credential data (serialized as JSON in the credential store). */
export interface StoredCredentials {
  /** FHE public key (hex-encoded). */
  publicKey: string;
  /** FHE private key (hex-encoded, encrypted at rest via AES-GCM). */
  privateKey: string;
  /** EIP-712 signature authorizing decryption. */
  signature: string;
  /** Contract addresses this credential is authorized for. */
  contractAddresses: Address[];
  /** Unix timestamp (seconds) when the credential became valid. */
  startTimestamp: number;
  /** Number of days the credential remains valid. */
  durationDays: number;
}

/**
 * Typed error codes thrown by the SDK.
 * Use `error.code` to programmatically handle specific failure modes.
 *
 * @example
 * ```ts
 * try {
 *   await token.confidentialTransfer("0xTo", 100n);
 * } catch (e) {
 *   if (e instanceof TokenError && e.code === TokenErrorCode.SigningRejected) {
 *     // User rejected the wallet signature
 *   }
 * }
 * ```
 */
export const TokenErrorCode = {
  /** User rejected the wallet signature prompt. */
  SigningRejected: "SIGNING_REJECTED",
  /** Wallet signature failed for a reason other than rejection. */
  SigningFailed: "SIGNING_FAILED",
  /** FHE encryption failed. */
  EncryptionFailed: "ENCRYPTION_FAILED",
  /** FHE decryption failed. */
  DecryptionFailed: "DECRYPTION_FAILED",
  /** Token does not support the confidential (ERC-7984) interface. */
  NotConfidential: "NOT_CONFIDENTIAL",
  /** Token does not support the wrapper interface. */
  NotWrapper: "NOT_WRAPPER",
  /** ERC-20 approval transaction failed. */
  ApprovalFailed: "APPROVAL_FAILED",
  /** On-chain transaction reverted. */
  TransactionReverted: "TRANSACTION_REVERTED",
  /** Credential store read/write failed. */
  StoreError: "STORE_ERROR",
} as const;

/** Union of all {@link TokenErrorCode} string values. */
export type TokenErrorCode = (typeof TokenErrorCode)[keyof typeof TokenErrorCode];

/**
 * Typed error thrown by all SDK operations.
 * Carries a {@link TokenErrorCode} for programmatic error handling.
 */
export class TokenError extends Error {
  /** Machine-readable error code. */
  readonly code: TokenErrorCode;

  constructor(code: TokenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TokenError";
    this.code = code;
  }
}
