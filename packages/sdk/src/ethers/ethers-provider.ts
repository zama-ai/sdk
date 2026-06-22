import { ethers, BrowserProvider } from "ethers";
import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  EIP1193Provider,
  Hex,
} from "viem";
import type { GenericProvider, ReadContractConfig, TransactionReceipt } from "../types";

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

  async getChainId(): Promise<number> {
    const network = await this.#readProvider.getNetwork();
    return Number(network.chainId);
  }

  async readContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "pure" | "view">,
    const TArgs extends ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>> {
    const contract = new ethers.Contract(
      config.address,
      config.abi as ethers.InterfaceAbi,
      this.#readProvider,
    );
    const fn = contract.getFunction(config.functionName);
    return fn(...(config.args as readonly unknown[])) as Promise<
      ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>
    >;
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.#readProvider.getBlock("latest");
    if (!block) {
      throw new Error("Failed to fetch latest block");
    }
    if (block.timestamp === null) {
      throw new Error("Latest block has no timestamp");
    }
    return BigInt(block.timestamp);
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const receipt = await this.#readProvider.waitForTransaction(hash);
    if (!receipt) {
      throw new Error("Transaction receipt not found");
    }
    return {
      logs: receipt.logs.map((log) => ({
        topics: log.topics.filter((t): t is Hex => t !== null),
        data: log.data as Hex,
      })),
    };
  }
}
