import type {
  Address,
  ContractAbi,
  GenericProvider,
  Hex,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  TransactionReceipt,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "@zama-fhe/sdk";
import { ConfigurationError, TransactionRevertedError } from "@zama-fhe/sdk";
import { encodeFunctionData, serializeTransaction, type Abi } from "viem";
import type { Config } from "wagmi";
import {
  getBlock,
  getChainId,
  getPublicClient,
  readContract,
  waitForTransactionReceipt,
} from "wagmi/actions";

/** Configuration for {@link WagmiProvider}. */
export interface WagmiProviderConfig {
  /** Wagmi `Config` — same instance passed to {@link WagmiSigner}. */
  config: Config;
}

/**
 * Read-only {@link GenericProvider} backed by wagmi.
 *
 * Uses the same `Config` as {@link WagmiSigner}, sharing the transport the
 * application has already configured. Pair with a {@link WagmiSigner} when
 * wallet authority is required.
 *
 * @example
 * ```ts
 * const provider = new WagmiProvider({ config: wagmiConfig });
 * const signer   = new WagmiSigner({ config: wagmiConfig });
 * ```
 */
export class WagmiProvider implements GenericProvider {
  readonly #config: Config;

  constructor(providerConfig: WagmiProviderConfig) {
    this.#config = providerConfig.config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.#config);
  }

  async readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>> {
    return readContract(this.#config, config);
  }

  /**
   * Wait for a transaction receipt.
   *
   * @param hash - The transaction hash to wait for.
   * @returns The transaction receipt.
   * @throws if the transaction hash cannot be found (e.g. an ERC-4337 bundler
   *   returned a `UserOperation` hash instead of a transaction hash). {@link TransactionRevertedError}
   */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    try {
      return await waitForTransactionReceipt(this.#config, { hash });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("could not be found") || message.includes("Transaction not found")) {
        throw new TransactionRevertedError(
          `Could not find transaction receipt for hash "${hash.slice(0, 10)}…". ` +
            "If using ERC-4337 with a bundler, your connector may be returning a UserOperation hash " +
            "instead of a transaction hash.",
          { cause: error instanceof Error ? error : undefined },
        );
      }
      throw error;
    }
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await getBlock(this.#config);
    return block.timestamp;
  }

  async sendRawTransaction(signedTx: Hex): Promise<Hex> {
    const publicClient = getPublicClient(this.#config);
    if (!publicClient) {
      throw new ConfigurationError(
        "WagmiProvider.sendRawTransaction: no public client configured for the active chain.",
      );
    }
    return publicClient.sendRawTransaction({ serializedTransaction: signedTx });
  }

  async prepareTransaction<
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
  }): Promise<Hex> {
    const publicClient = getPublicClient(this.#config);
    if (!publicClient) {
      throw new ConfigurationError(
        "WagmiProvider.prepareTransaction: no public client configured for the active chain.",
      );
    }
    const { from, call } = args;
    const data = encodeFunctionData({
      abi: call.abi as Abi,
      functionName: call.functionName as string,
      args: call.args as readonly unknown[],
    });
    // Wrap estimateGas — pre-flight revert is the high-value failure mode.
    // Skip the network round-trips entirely when the caller supplied
    // overrides — useful for custodians with their own nonce/fee managers.
    const chainIdPromise = publicClient.getChainId();
    const noncePromise =
      args.nonce !== undefined
        ? Promise.resolve(args.nonce)
        : publicClient.getTransactionCount({ address: from });
    const gasPromise =
      args.gasLimit !== undefined
        ? Promise.resolve(args.gasLimit)
        : (call.gas ??
          publicClient
            .estimateGas({
              account: from,
              to: call.address,
              data,
              value: call.value ?? 0n,
            })
            .catch((error: unknown) => {
              throw new TransactionRevertedError(
                `WagmiProvider.prepareTransaction: gas estimation reverted for ${call.functionName as string} on ${call.address}`,
                { cause: error },
              );
            }));
    const feesPromise =
      args.maxFeePerGas !== undefined && args.maxPriorityFeePerGas !== undefined
        ? Promise.resolve({
            maxFeePerGas: args.maxFeePerGas,
            maxPriorityFeePerGas: args.maxPriorityFeePerGas,
          })
        : publicClient.estimateFeesPerGas();
    const [chainId, nonce, gas, fees] = await Promise.all([
      chainIdPromise,
      noncePromise,
      gasPromise,
      feesPromise,
    ]);
    return serializeTransaction({
      type: "eip1559",
      chainId,
      nonce,
      to: call.address,
      data,
      value: call.value ?? 0n,
      gas,
      maxFeePerGas: args.maxFeePerGas ?? fees.maxFeePerGas,
      maxPriorityFeePerGas: args.maxPriorityFeePerGas ?? fees.maxPriorityFeePerGas,
    });
  }
}
