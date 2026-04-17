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

/** Configuration for {@link WagmiProvider}. */
export interface WagmiProviderConfig {
  /** Wagmi `Config` — same instance passed to `WagmiSigner`. */
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
  private readonly config: Config;

  constructor(providerConfig: WagmiProviderConfig) {
    this.config = providerConfig.config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>> {
    return readContract(this.config, config);
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    try {
      return await waitForTransactionReceipt(this.config, { hash });
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
    const block = await getBlock(this.config);
    return block.timestamp;
  }
}
