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
import { TransactionRevertedError } from "../errors";
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
    return this.#publicClient.sendRawTransaction({
      serializedTransaction: signedTx,
    });
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
    const { from, call } = args;
    const data = encodeFunctionData({
      abi: call.abi as Abi,
      functionName: call.functionName as string,
      args: call.args as readonly unknown[],
    });
    // Wrap the estimateGas leg so a pre-flight revert (the most common
    // prepareTransaction failure) surfaces as a typed error with the
    // function name + cause. Other legs propagate as-is — failures there
    // (chainId, nonce, fee data) are rare and usually self-explanatory.
    // Skip the network round-trips entirely when the caller supplied
    // overrides — useful for custodians with their own nonce/fee managers.
    const chainIdPromise = this.#publicClient.getChainId();
    const noncePromise =
      args.nonce !== undefined
        ? Promise.resolve(args.nonce)
        : this.#publicClient.getTransactionCount({ address: from });
    const gasPromise =
      args.gasLimit !== undefined
        ? Promise.resolve(args.gasLimit)
        : (call.gas ??
          this.#publicClient
            .estimateGas({
              account: from,
              to: call.address,
              data,
              value: call.value ?? 0n,
            })
            .catch((error: unknown) => {
              throw new TransactionRevertedError(
                `ViemProvider.prepareTransaction: gas estimation reverted for ${call.functionName} on ${call.address}`,
                { cause: error },
              );
            }));
    const feesPromise =
      args.maxFeePerGas !== undefined && args.maxPriorityFeePerGas !== undefined
        ? Promise.resolve({
            maxFeePerGas: args.maxFeePerGas,
            maxPriorityFeePerGas: args.maxPriorityFeePerGas,
          })
        : this.#publicClient.estimateFeesPerGas();
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
