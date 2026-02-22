import type { GenericSigner, ContractCallConfig, TransactionReceipt } from "../token/token.types";
import type { PublicClient, WalletClient } from "viem";
import type { Hex, EIP712TypedData } from "../relayer/relayer-sdk.types";
import { writeContract } from "viem/actions";

/**
 * GenericSigner backed by viem.
 *
 * @param walletClient - viem WalletClient (for signing + writes)
 * @param publicClient - viem PublicClient (for reads)
 */
export class ViemSigner implements GenericSigner {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;

  constructor(walletClient: WalletClient, publicClient: PublicClient) {
    this.walletClient = walletClient;
    this.publicClient = publicClient;
  }

  async getAddress(): Promise<Hex> {
    const account = this.walletClient.account;
    if (!account) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const account = this.walletClient.account;
    if (!account) throw new TypeError("WalletClient has no account");
    return this.walletClient.signTypedData({
      account,
      primaryType: Object.keys(typedData.types)[0],
      ...typedData,
    });
  }

  async writeContract<C extends ContractCallConfig = ContractCallConfig>(config: C): Promise<Hex> {
    const account = this.walletClient.account;
    if (!account) throw new TypeError("WalletClient has no account");
    return this.walletClient.writeContract({
      chain: this.walletClient.chain,
      account,
      ...config,
    } as Parameters<typeof writeContract>[1]);
  }

  async readContract<T, C extends ContractCallConfig = ContractCallConfig>(config: C): Promise<T> {
    return this.publicClient.readContract(config) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
