import {
  encodeFunctionData,
  serializeTransaction,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionReturnType,
  type Hex,
  type PublicClient,
} from "viem";
import type {
  ContractAbi,
  GenericProvider,
  ReadContractConfig,
  TransactionReceipt,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../types";

/** Configuration for {@link ViemProvider}. */
export interface ViemProviderConfig {
  /** A viem `PublicClient` backing all read operations. */
  publicClient: PublicClient;
}

/**
 * Read-only {@link GenericProvider} backed by a viem `PublicClient`.
 *
 * Use this for integrations that only need public chain reads before the user has Pair with a
 * {@link ViemSigner} when wallet authority is required; the two can share a transport or point at
 * independent RPCs.
 *
 * @example
 * ```ts
 * const publicClient = createPublicClient({ chain: sepolia, transport: http(ALCHEMY_URL) });
 * const provider = new ViemProvider({ publicClient });
 * ```
 */
export class ViemProvider implements GenericProvider {
  readonly #publicClient: PublicClient;

  constructor(config: ViemProviderConfig) {
    this.#publicClient = config.publicClient;
  }

  async getChainId(): Promise<number> {
    return this.#publicClient.getChainId();
  }

  async readContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "pure" | "view">,
    const TArgs extends ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>> {
    return this.#publicClient.readContract(config);
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    return this.#publicClient.waitForTransactionReceipt({ hash });
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.#publicClient.getBlock();
    return block.timestamp;
  }

  async sendRawTransaction(signedTx: Hex): Promise<Hex> {
    return this.#publicClient.sendRawTransaction({ serializedTransaction: signedTx });
  }

  async prepareTransaction<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(args: { from: Address; call: WriteContractConfig<TAbi, TFunctionName, TArgs> }): Promise<Hex> {
    const { from, call } = args;
    const data = encodeFunctionData({
      abi: call.abi as Abi,
      functionName: call.functionName as string,
      args: call.args as readonly unknown[],
    });
    const [chainId, nonce, gas, fees] = await Promise.all([
      this.#publicClient.getChainId(),
      this.#publicClient.getTransactionCount({ address: from }),
      call.gas ??
        this.#publicClient.estimateGas({
          account: from,
          to: call.address,
          data,
          value: call.value ?? 0n,
        }),
      this.#publicClient.estimateFeesPerGas(),
    ]);
    return serializeTransaction({
      type: "eip1559",
      chainId,
      nonce,
      to: call.address,
      data,
      value: call.value ?? 0n,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
  }
}
