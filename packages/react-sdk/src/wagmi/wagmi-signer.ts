import type {
  GenericSigner,
  ContractCallConfig,
  TransactionReceipt,
  Address,
  Hex,
  EIP712TypedData,
} from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import {
  getChainId,
  getConnection,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";

/**
 * GenericSigner backed by wagmi.
 *
 * @param config - Wagmi config (from useConfig())
 */
export class WagmiSigner implements GenericSigner {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async getAddress(): Promise<Address> {
    const account = getConnection(this.config);
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
    return waitForTransactionReceipt(this.config, { hash });
  }
}
