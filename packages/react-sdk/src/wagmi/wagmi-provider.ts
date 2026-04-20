import type {
  ContractAbi,
  GenericProvider,
  Hex,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  TransactionReceipt,
} from "@zama-fhe/sdk";
import { TransactionRevertedError } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { getBlock, getChainId, readContract, waitForTransactionReceipt } from "wagmi/actions";

/** Configuration for {@link ZamaWagmiProvider}. */
export interface ZamaWagmiProviderConfig {
  /** Wagmi `Config` — same instance passed to {@link ZamaWagmiSigner}. */
  config: Config;
}

/**
 * Read-only {@link GenericProvider} backed by wagmi.
 *
 * Uses the same `Config` as {@link ZamaWagmiSigner}, sharing the transport the
 * application has already configured. Pair with a {@link ZamaWagmiSigner} when
 * wallet authority is required.
 *
 * @example
 * ```ts
 * const provider = new ZamaWagmiProvider({ config: wagmiConfig });
 * const signer   = new ZamaWagmiSigner({ config: wagmiConfig });
 * ```
 */
export class ZamaWagmiProvider implements GenericProvider {
  readonly #config: Config;

  constructor(providerConfig: ZamaWagmiProviderConfig) {
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
   * @throws {@link TransactionRevertedError} if the transaction hash cannot be found (e.g.
   *   an ERC-4337 bundler returned a `UserOperation` hash instead of a transaction hash).
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
}
