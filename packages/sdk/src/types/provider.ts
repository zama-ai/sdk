import type { Address, Hex } from "viem";
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
 * {@link EthersProvider}, or {@link WagmiProvider}; or implement the
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
  /** Return the latest block timestamp in seconds. */
  getBlockTimestamp(): Promise<bigint>;
  /**
   * Broadcast a previously-signed transaction and return its hash.
   *
   * Used by the SDK's offline-signing path: the caller signs the prepared
   * unsigned transaction out-of-process (a custodian / HSM / policy engine
   * returns signed bytes), and the SDK submits them through this method.
   * Atomic signers (`writeContract`) do not exercise this path — their wallet
   * broadcasts directly.
   *
   * Custom adapters delegate to the underlying client's raw-send method:
   * `publicClient.sendRawTransaction({ serializedTransaction })` (viem),
   * `provider.broadcastTransaction(signedTx)` (ethers v6).
   */
  sendRawTransaction(signedTx: Hex): Promise<Hex>;
  /**
   * Build a fully-populated, RLP-encoded unsigned transaction from a
   * write-contract config and the originating wallet address. The provider
   * resolves chain ID, nonce, gas limit, and EIP-1559 fee parameters from
   * chain state and returns bytes ready to be signed out-of-process (an HSM,
   * custody API, or policy engine) and broadcast via
   * {@link GenericProvider.sendRawTransaction}.
   *
   * Optional overrides (`nonce`, `maxFeePerGas`, `maxPriorityFeePerGas`,
   * `gasLimit`) let callers pin values at prepare time — used by the
   * offline-signing pipeline when a custodian supplies its own nonce/fee
   * manager. Implementers may ignore unknown optional args without breaking.
   *
   * Used exclusively by the offline-signing pipeline. Atomic signers go
   * through {@link GenericSigner.writeContract} and never invoke this.
   *
   * Adapters delegate to their underlying client's tx-building primitives:
   * `encodeFunctionData` + `estimateGas` + `getTransactionCount` +
   * `estimateFeesPerGas` + `serializeTransaction` (viem), the analogous
   * `Contract.populateTransaction` + `Transaction.unsignedSerialized`
   * pipeline (ethers v6).
   *
   * Nonce reads use the `"pending"` block tag so parallel custodian queues
   * with multiple in-flight approvals against the same wallet don't collide
   * on a stale `"latest"` count. Pass `nonce` to bypass the read entirely
   * (e.g. when the custodian assigns nonces itself).
   */
  prepareTransaction<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(args: {
    from: Address;
    call: WriteContractConfig<TAbi, TFunctionName, TArgs>;
    nonce?: number;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasLimit?: bigint;
  }): Promise<Hex>;
}
