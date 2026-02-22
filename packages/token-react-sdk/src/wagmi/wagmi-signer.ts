import type {
  GenericSigner,
  ContractCallConfig,
  TransactionReceipt,
  Hex,
  EIP712TypedData,
} from "@zama-fhe/token-sdk";
import type { Config } from "wagmi";
import {
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

  async getAddress(): Promise<Hex> {
    const account = getConnection(this.config);
    if (!account.address) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    return signTypedData(this.config, {
      primaryType: Object.keys(typedData.types)[0],
      ...typedData,
    }) as Promise<Hex>;
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
