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
  MulticallReturnType,
  ReadContractConfig,
  TransactionReceipt,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../types";
import { requireReadChain } from "../utils/alignment";

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

  /** Return the chain ID of the connected network. */
  async getChainId(): Promise<number> {
    return this.#publicClient.getChainId();
  }

  /** Execute a read-only call and return the decoded result. */
  async readContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "pure" | "view">,
    const TArgs extends ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>> {
    const { chainId, ...call } = config;
    await requireReadChain("ViemProvider", chainId, () => this.getChainId());
    return this.#publicClient.readContract(call as typeof config);
  }

  /**
   * Run many reads in one Multicall3 call. On a chain whose viem definition
   * names no Multicall3, such as a local Hardhat node, the call carries its code.
   */
  async multicall<const TCalls extends readonly ReadContractConfig[]>(params: {
    readonly calls: TCalls;
    readonly chainId?: number;
  }): Promise<MulticallReturnType<TCalls>> {
    await requireReadChain("ViemProvider", params.chainId, () => this.getChainId());
    const results = await this.#publicClient.multicall({
      contracts: params.calls.map(({ chainId: _, ...call }) => call) as never,
      allowFailure: false,
      deployless: this.#publicClient.chain?.contracts?.multicall3 === undefined,
    });
    return results as MulticallReturnType<TCalls>;
  }

  /** Wait for a transaction to be mined and return its receipt. */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    return this.#publicClient.waitForTransactionReceipt({ hash });
  }

  /** Return the latest block timestamp in seconds. */
  async getBlockTimestamp(chainId?: number): Promise<bigint> {
    await requireReadChain("ViemProvider", chainId, () => this.getChainId());
    const block = await this.#publicClient.getBlock();
    return block.timestamp;
  }

  /** Build a fully-populated, RLP-encoded unsigned transaction ready to be signed offline. */
  async prepareTransaction<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(args: {
    from: Address;
    calldata: WriteContractConfig<TAbi, TFunctionName, TArgs>;
    nonce?: number;
    gasLimit?: bigint;
    fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  }): Promise<Hex> {
    const { from, calldata } = args;
    const data = encodeFunctionData({
      abi: calldata.abi as Abi,
      functionName: calldata.functionName as string,
      args: calldata.args as readonly unknown[],
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
        : this.#publicClient.getTransactionCount({ address: from, blockTag: "pending" });
    const gasPromise =
      args.gasLimit !== undefined
        ? Promise.resolve(args.gasLimit)
        : (calldata.gas ??
          this.#publicClient
            .estimateGas({ account: from, to: calldata.address, data, value: calldata.value ?? 0n })
            .catch((error: unknown) => {
              throw new TransactionRevertedError(
                `ViemProvider.prepareTransaction: gas estimation reverted for ${calldata.functionName} on ${calldata.address}`,
                { cause: error },
              );
            }));
    const feesPromise = args.fees ?? this.#publicClient.estimateFeesPerGas();
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
      to: calldata.address,
      data,
      value: calldata.value ?? 0n,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
  }
}
