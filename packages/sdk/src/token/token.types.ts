import type { RawLog } from "../events/onchain-events";
import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
} from "viem";

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

export type ContractAbi = Abi | readonly unknown[];

export type ReadFunctionName<TAbi extends ContractAbi = ContractAbi> = ContractFunctionName<
  TAbi,
  "pure" | "view"
>;

export type WriteFunctionName<TAbi extends ContractAbi = ContractAbi> = ContractFunctionName<
  TAbi,
  "nonpayable" | "payable"
>;

export type ReadContractArgs<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends ReadFunctionName<TAbi> = ReadFunctionName<TAbi>,
> = ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>;

export type WriteContractArgs<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends WriteFunctionName<TAbi> = WriteFunctionName<TAbi>,
> = ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>;

export type ReadContractReturnType<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends ReadFunctionName<TAbi> = ReadFunctionName<TAbi>,
  TArgs extends ReadContractArgs<TAbi, TFunctionName> = ReadContractArgs<TAbi, TFunctionName>,
> = ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>;

/**
 * Typed read-contract configuration.
 * Matches the shape returned by read contract builders in `src/contracts/`.
 */
export interface ReadContractConfig<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends ReadFunctionName<TAbi> = ReadFunctionName<TAbi>,
  TArgs extends ReadContractArgs<TAbi, TFunctionName> = ReadContractArgs<TAbi, TFunctionName>,
> {
  /** Target contract address. */
  readonly address: Address;
  /** ABI fragment for the function being called. */
  readonly abi: TAbi;
  /** Solidity function name. */
  readonly functionName: TFunctionName;
  /** Contract call arguments inferred from the ABI and function name. */
  readonly args: TArgs;
}

/**
 * Typed write-contract configuration.
 * Matches the shape returned by write contract builders in `src/contracts/`.
 */
export interface WriteContractConfig<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends WriteFunctionName<TAbi> = WriteFunctionName<TAbi>,
  TArgs extends WriteContractArgs<TAbi, TFunctionName> = WriteContractArgs<TAbi, TFunctionName>,
> {
  /** Target contract address. */
  readonly address: Address;
  /** ABI fragment for the function being called. */
  readonly abi: TAbi;
  /** Solidity function name. */
  readonly functionName: TFunctionName;
  /** Contract call arguments inferred from the ABI and function name. */
  readonly args: TArgs;
  /** Native value to send with the transaction (for payable functions). */
  readonly value?: bigint;
  /** Gas limit override. */
  readonly gas?: bigint;
}

/** Callbacks for signer lifecycle events (wallet disconnect, account switch). */
export interface SignerLifecycleCallbacks {
  /** Called when the wallet disconnects. */
  onDisconnect?: () => void;
  /** Called when the active account changes. */
  onAccountChange?: (newAddress: Address) => void;
  /** Called when the connected chain changes. */
  onChainChange?: (newChainId: number) => void;
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
  writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  /** Execute a read-only call and return the decoded result. */
  readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>>;
  /** Wait for a transaction to be mined and return its receipt. */
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
  /**
   * Return the latest block timestamp in seconds.
   * Used by {@link ReadonlyToken.isDelegated} to compare delegation expiry
   * against the chain clock instead of the local clock.
   *
   * Optional — when not implemented, `isDelegated` falls back to `Date.now()`.
   */
  getBlockTimestamp?: () => Promise<bigint>;
  /**
   * Subscribe to wallet lifecycle events (disconnect, account change, chain change).
   * Returns an unsubscribe function. When no EIP-1193 provider is available,
   * returns a no-op unsubscribe.
   *
   * Optional — server-side signers or custom implementations that don't
   * support lifecycle events can omit this method entirely.
   */
  subscribe?: (callbacks: SignerLifecycleCallbacks) => () => void;
}

/**
 * Pluggable key-value store for persisting FHE credentials.
 *
 * The SDK stores objects directly (not JSON strings). Implementations must
 * preserve value types through round-trips — e.g. `IndexedDBStorage` uses
 * structured clone, `MemoryStorage` stores values as-is. If your custom
 * backend serializes to JSON internally, it must handle `JSON.parse` /
 * `JSON.stringify` transparently so callers always receive the original type.
 */
export interface GenericStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Stored FHE credential data (serialized as JSON in the credential store). */
export interface StoredCredentials {
  /** FHE public key (hex-encoded). */
  publicKey: Hex;
  /** FHE private key (hex-encoded, encrypted at rest via AES-GCM). */
  privateKey: Hex;
  /** EIP-712 signature authorizing decryption. */
  signature: Hex;
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

/** Progress callbacks for multi-step shield operations. */
export interface ShieldCallbacks {
  /** Fired after the ERC-20 approval transaction is submitted (skipped when `approvalStrategy: "skip"`). */
  onApprovalSubmitted?: (txHash: Hex) => void;
  /** Fired after the shield (wrap) transaction is submitted. */
  onShieldSubmitted?: (txHash: Hex) => void;
}

/** Progress callbacks for multi-step confidential transfer operations. */
export interface TransferCallbacks {
  /** Fired after FHE encryption of the transfer amount completes. */
  onEncryptComplete?: () => void;
  /** Fired after the transfer transaction is submitted. */
  onTransferSubmitted?: (txHash: Hex) => void;
}
