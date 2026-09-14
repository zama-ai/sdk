import { ethers, BrowserProvider, Transaction } from "ethers";
import type {
  Abi,
  Address,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  EIP1193Provider,
  Hex,
} from "viem";
import { ConfigurationError, TransactionRevertedError } from "../errors";
import type {
  ContractAbi,
  GenericProvider,
  ReadContractConfig,
  TransactionReceipt,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../types";
import { assertHex } from "../utils/assertions";
import { ethersRead } from "./contracts";

/**
 * Configuration for {@link EthersProvider}.
 *
 * Two variants:
 *
 * - **EIP-1193** — `{ ethereum }`: pass the raw EIP-1193 provider (e.g. `window.ethereum`).
 *   A `BrowserProvider` is created internally.
 *
 * - **Pre-built** — `{ provider }`: pass any ethers `Provider`
 *   (e.g. `JsonRpcProvider`, `WebSocketProvider`).
 */
export type EthersProviderConfig = { ethereum: EIP1193Provider } | { provider: ethers.Provider };

/**
 * Read-only {@link GenericProvider} backed by ethers v6.
 *
 * Use this for integrations that only need public chain reads before the user has connected their
 * wallet.
 *
 * @example
 * ```ts
 * // Dedicated RPC
 * const provider = new EthersProvider({
 *   provider: new ethers.JsonRpcProvider(ALCHEMY_URL),
 * });
 *
 * // Wallet-sourced RPC (shares transport with EthersSigner)
 * const provider = new EthersProvider({ ethereum: window.ethereum });
 * ```
 */
export class EthersProvider implements GenericProvider {
  readonly #readProvider: ethers.Provider;

  constructor(config: EthersProviderConfig) {
    if ("ethereum" in config) {
      this.#readProvider = new BrowserProvider(config.ethereum);
    } else {
      this.#readProvider = config.provider;
    }
  }

  /** Return the chain ID of the connected network. */
  async getChainId(): Promise<number> {
    const network = await this.#readProvider.getNetwork();
    return Number(network.chainId);
  }

  /**
   * Execute a read-only call and return the decoded result.
   *
   * ethers is the transport only: the call goes out over `provider.call`, and viem does the
   * encoding and decoding (via {@link ethersRead}). That keeps the result identical to
   * `ViemProvider` — the return-type contract both providers implement — rather than re-deriving
   * viem's decoding rules (small ints as `number`, named tuples as keyed objects, empty output as
   * `undefined`) from ethers' own decoded values.
   */
  async readContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "pure" | "view">,
    const TArgs extends ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>> {
    return ethersRead(this.#readProvider, {
      address: config.address,
      abi: config.abi as readonly unknown[],
      functionName: config.functionName,
      args: config.args as readonly unknown[],
    });
  }

  /** Return the latest block timestamp in seconds. */
  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.#readProvider.getBlock("latest");
    if (!block) {
      throw new ConfigurationError(
        "EthersProvider.getBlockTimestamp: failed to fetch latest block",
      );
    }
    if (block.timestamp === null) {
      throw new ConfigurationError(
        "EthersProvider.getBlockTimestamp: latest block has no timestamp",
      );
    }
    return BigInt(block.timestamp);
  }

  /** Wait for a transaction to be mined and return its receipt. */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const receipt = await this.#readProvider.waitForTransaction(hash);
    if (!receipt) {
      throw new TransactionRevertedError(
        `EthersProvider.waitForTransactionReceipt: no receipt found for tx ${hash}. ` +
          "The transaction may have been dropped from the mempool, or the RPC's wait timeout elapsed.",
      );
    }
    return {
      logs: receipt.logs.map((log) => ({
        address: log.address as Hex,
        topics: log.topics.filter((t): t is Hex => t !== null),
        data: log.data as Hex,
      })),
    };
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
    const iface = new ethers.Interface(calldata.abi as unknown as ethers.InterfaceAbi);
    // Resolve overloaded ABI entries by name + arity. ethers'
    // `getFunction(key, values)` allows for an "overrides" object as the
    // last arg, so a 2-arg fragment still matches a 3-value call and
    // overloads like ERC-7984 `confidentialTransfer(address,bytes32)` vs
    // `confidentialTransfer(address,bytes32,bytes)` aren't disambiguated.
    const candidates: ethers.FunctionFragment[] = [];
    iface.forEachFunction((frag) => {
      if (frag.name === calldata.functionName) {
        candidates.push(frag);
      }
    });
    const argLength = (calldata.args as readonly unknown[]).length;
    const fragment =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((frag) => frag.inputs.length === argLength);
    if (!fragment) {
      throw new Error(`Function ${calldata.functionName}(${argLength} args) not found in ABI`);
    }
    const data = iface.encodeFunctionData(fragment, calldata.args as readonly unknown[]);
    assertHex(data, "data");

    const value = calldata.value ?? 0n;
    // Wrap estimateGas — pre-flight revert is the high-value failure mode.
    // Skip the network round-trips entirely when the caller supplied
    // overrides — useful for custodians with their own nonce/fee managers.
    const networkPromise = this.#readProvider.getNetwork();
    const noncePromise =
      args.nonce !== undefined
        ? Promise.resolve(args.nonce)
        : this.#readProvider.getTransactionCount(from, "pending");
    const gasPromise =
      args.gasLimit !== undefined
        ? Promise.resolve(args.gasLimit)
        : (calldata.gas ??
          this.#readProvider
            .estimateGas({ from, to: calldata.address, data, value })
            .catch((error: unknown) => {
              throw new TransactionRevertedError(
                `EthersProvider.prepareTransaction: gas estimation reverted for ${calldata.functionName as string} on ${calldata.address}`,
                { cause: error },
              );
            }));
    const feeDataPromise = args.fees ?? this.#readProvider.getFeeData();
    const [network, nonce, gasLimit, feeData] = await Promise.all([
      networkPromise,
      noncePromise,
      gasPromise,
      feeDataPromise,
    ]);
    const maxFeePerGas = feeData.maxFeePerGas;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    if (maxFeePerGas === null || maxPriorityFeePerGas === null) {
      throw new ConfigurationError(
        "EthersProvider.prepareTransaction: EIP-1559 fee data unavailable (provider returned null maxFeePerGas). " +
          "The connected chain may not support EIP-1559 type-2 transactions.",
      );
    }
    const tx = Transaction.from({
      type: 2,
      chainId: Number(network.chainId),
      nonce,
      to: calldata.address,
      data,
      value,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    return tx.unsignedSerialized as Hex;
  }
}
