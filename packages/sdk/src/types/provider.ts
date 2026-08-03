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
   * Build a fully-populated, RLP-encoded unsigned transaction from a
   * write-contract config and the originating wallet address. The provider
   * resolves chain ID, nonce, gas limit, and EIP-1559 fee parameters from
   * chain state and returns bytes ready to be signed out-of-process (an HSM,
   * custody API, or policy engine)
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
   * Nonce reads use the `"pending"` block tag so that once an earlier tx has
   * been broadcast, the next prepare picks up the incremented count instead of
   * a stale `"latest"`. Note `"pending"` does **not** disambiguate several
   * payloads prepared *before* any of them is broadcast — they all read the
   * same count; pass an explicit `nonce` to assign them yourself in that case.
   */
  prepareTransaction<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    args:
      | {
          from: Address;
          calldata: WriteContractConfig<TAbi, TFunctionName, TArgs>;
          nonce?: number;
          gasLimit?: bigint;
          maxFeePerGas?: never;
          maxPriorityFeePerGas?: never;
        }
      | {
          from: Address;
          calldata: WriteContractConfig<TAbi, TFunctionName, TArgs>;
          nonce?: number;
          gasLimit?: bigint;
          maxFeePerGas: bigint;
          maxPriorityFeePerGas: bigint;
        },
  ): Promise<Hex>;
}
