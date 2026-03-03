import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import { writeContract } from "viem/actions";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractCallConfig,
  GenericSigner,
  Hex,
  SignerLifecycleCallbacks,
  TransactionReceipt,
} from "../token/token.types";

/** Configuration for {@link ViemSigner}. */
export interface ViemSignerConfig {
  walletClient: WalletClient;
  publicClient: PublicClient;
  provider?: EIP1193Provider;
}

/**
 * GenericSigner backed by viem.
 *
 * @param config - {@link ViemSignerConfig} with walletClient and publicClient
 */
export class ViemSigner implements GenericSigner {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly provider?: EIP1193Provider;

  constructor(config: ViemSignerConfig) {
    this.walletClient = config.walletClient;
    this.publicClient = config.publicClient;
    this.provider = config.provider;
  }

  async getChainId(): Promise<number> {
    return this.publicClient.getChainId();
  }

  async getAddress(): Promise<Address> {
    const account = this.walletClient.account;
    if (!account) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const account = this.walletClient.account;
    if (!account) throw new TypeError("WalletClient has no account");
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return this.walletClient.signTypedData({
      account,
      primaryType: Object.keys(sigTypes)[0]!,
      types: sigTypes,
      domain: typedData.domain,
      message: typedData.message,
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

  subscribe({
    onDisconnect = () => {},
    onAccountChange = () => {},
  }: SignerLifecycleCallbacks): () => void {
    const provider = this.provider;
    if (!provider) return () => {};

    let currentAddress: string | undefined;
    this.getAddress()
      .then((addr) => {
        currentAddress = addr;
      })
      .catch(() => {});

    const handleAccountsChanged = async (accounts: Address[]) => {
      if (accounts.length === 0) {
        return onDisconnect();
      }
      if (
        currentAddress &&
        accounts[0] &&
        accounts[0].toLowerCase() !== currentAddress.toLowerCase()
      ) {
        onAccountChange(accounts[0]);
      }
      currentAddress = accounts[0];
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("disconnect", onDisconnect);

    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("disconnect", onDisconnect);
    };
  }
}
