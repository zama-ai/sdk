import type {
  GenericSigner,
  ContractCallConfig,
  TransactionReceipt,
  Address,
  Hex,
  EIP712TypedData,
} from "@zama-fhe/sdk";
import { TransactionRevertedError } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import {
  getChainId,
  getAccount,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";

/** Configuration for {@link WagmiSigner}. */
export interface WagmiSignerConfig {
  config: Config;
}

/**
 * GenericSigner backed by wagmi.
 *
 * @param signerConfig - {@link WagmiSignerConfig} with wagmi config
 */
export class WagmiSigner implements GenericSigner {
  private readonly config: Config;

  constructor(signerConfig: WagmiSignerConfig) {
    this.config = signerConfig.config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async getAddress(): Promise<Address> {
    const account = getAccount(this.config);
    if (!account?.address) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return signTypedData(this.config, {
      primaryType: Object.keys(sigTypes)[0]!,
      types: sigTypes,
      domain: typedData.domain,
      message: typedData.message,
    });
  }

  async writeContract<C extends ContractCallConfig>(config: C): Promise<Hex> {
    return writeContract(this.config, config as Parameters<typeof writeContract>[1]);
  }

  async readContract<T, C extends ContractCallConfig = ContractCallConfig>(config: C): Promise<T> {
    return readContract(this.config, config) as Promise<T>;
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
}
