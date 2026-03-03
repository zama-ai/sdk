import type { RawLog } from "../events/onchain-events";
import type { Address, EIP712TypedData, Hex } from "../relayer/relayer-sdk.types";
export type { Address } from "../relayer/relayer-sdk.types";
export type { Hex } from "../relayer/relayer-sdk.types";

/** Framework-agnostic transaction receipt (only the fields the SDK needs). */
export interface TransactionReceipt {
  /** Event logs emitted during the transaction. */
  readonly logs: readonly RawLog[];
}

/** Result of a write operation: the tx hash and its mined receipt. */
export interface TransactionResult {
  /** The transaction hash. */
  txHash: Hex;
  /** The mined transaction receipt. */
  receipt: TransactionReceipt;
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
 * Minimal EIP-1193 provider interface for subscribing to wallet events.
 * Pass this to ViemSigner/EthersSigner to enable automatic session revocation.
 */
export interface EIP1193Provider {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

/** Callbacks for signer lifecycle events (wallet disconnect, account switch). */
export interface SignerLifecycleCallbacks {
  /** Called when the wallet disconnects. */
  onDisconnect?: () => void;
  /** Called when the active account changes. */
  onAccountChange?: (newAddress: Address) => void;
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
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  /** Send a write transaction and return the tx hash. */
  writeContract<C extends ContractCallConfig>(config: C): Promise<Hex>;
  /** Execute a read-only call and return the decoded result. */
  readContract<T = unknown, C extends ContractCallConfig = ContractCallConfig>(
    config: C,
  ): Promise<T>;
  /** Wait for a transaction to be mined and return its receipt. */
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
  /**
   * Subscribe to wallet lifecycle events (disconnect, account change).
   * Returns an unsubscribe function. When no EIP-1193 provider is available,
   * returns a no-op unsubscribe.
   */
  subscribe(callbacks: SignerLifecycleCallbacks): () => void;
}

/** Pluggable key-value store for persisting FHE credentials. */
export interface GenericStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
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

/** Progress callbacks for multi-step unshield operations. */
export interface UnshieldCallbacks {
  /** Fired after the unwrap transaction is submitted. */
  onUnwrapSubmitted?: (txHash: Hex) => void;
  /** Fired when the finalization step begins (receipt parsed, about to finalize). */
  onFinalizing?: () => void;
  /** Fired after the finalize transaction is submitted. */
  onFinalizeSubmitted?: (txHash: Hex) => void;
}

// Re-export errors for backward compatibility
export {
  ZamaErrorCode,
  type ZamaErrorCode as ZamaErrorCodeType,
  ZamaError,
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
  InvalidCredentialsError,
  NoCiphertextError,
  RelayerRequestFailedError,
} from "./errors";
