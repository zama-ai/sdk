import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  Hex,
  PublicClient,
} from "viem";
import type { GenericProvider, ReadContractConfig, TransactionReceipt } from "../types";

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
}
