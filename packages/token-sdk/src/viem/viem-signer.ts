import type {
  ConfidentialSigner,
  ContractCallConfig,
  TransactionReceipt,
} from "../token/confidential-token.types";
import type { PublicClient, WalletClient } from "viem";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
import { writeContract } from "viem/actions";

/**
 * ConfidentialSigner backed by viem.
 *
 * @param walletClient - viem WalletClient (for signing + writes)
 * @param publicClient - viem PublicClient (for reads)
 */
export class ViemSigner implements ConfidentialSigner {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;

  constructor(walletClient: WalletClient, publicClient: PublicClient) {
    this.walletClient = walletClient;
    this.publicClient = publicClient;
  }

  async getAddress(): Promise<Address> {
    const account = this.walletClient.account;
    if (!account) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Address> {
    return this.walletClient.signTypedData({
      account: this.walletClient.account!,
      primaryType: Object.keys(typedData.types)[0],
      ...typedData,
    });
  }

  async writeContract<C extends ContractCallConfig = ContractCallConfig>(
    config: C,
  ): Promise<Address> {
    return this.walletClient.writeContract({
      chain: this.walletClient.chain,
      account: this.walletClient.account!,
      ...config,
    } as Parameters<typeof writeContract>[1]);
  }

  async readContract<T, C extends ContractCallConfig = ContractCallConfig>(
    config: C,
  ): Promise<T> {
    return this.publicClient.readContract(config) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Address): Promise<TransactionReceipt> {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
