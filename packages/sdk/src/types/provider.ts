import type { Hex } from "viem";
import type {
  ContractAbi,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
} from "./contract";
import type { TransactionReceipt } from "./transaction";

/**
 * Framework-agnostic read-only provider interface.
 *
 * Represents the minimal set of capabilities needed to perform public chain
 * reads: querying state via `eth_call`, checking chain identity, awaiting
 * transaction receipts, and fetching block timestamps.
 *
 * Any caller with only an RPC endpoint (server indexer, SSR, dApp pre-connect)
 * can drive the SDK via a {@link GenericProvider} implementation, without
 * instantiating a wallet-shaped object. Use {@link ViemProvider},
 * {@link EthersProvider}, or {@link ZamaWagmiProvider}; or implement the
 * interface directly.
 */
export interface GenericProvider {
  /** Return the chain ID of the connected network. */
  getChainId(): Promise<number>;
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
  getBlockTimestamp(): Promise<bigint>;
}
