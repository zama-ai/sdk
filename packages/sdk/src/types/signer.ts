import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractAbi,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "./contract";
import type { TransactionReceipt } from "./transaction";

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
   */
  getBlockTimestamp: () => Promise<bigint>;
  /**
   * Subscribe to wallet lifecycle events (disconnect, account change, chain change).
   * Returns an unsubscribe function.
   *
   * Optional — server-side signers or custom implementations that don't
   * support lifecycle events can omit this method entirely.
   */
  subscribe?: (callbacks: SignerLifecycleCallbacks) => () => void;
}
