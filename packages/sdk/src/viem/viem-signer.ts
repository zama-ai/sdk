import type {
  Account,
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  EIP1193Provider,
  PublicClient,
  WalletClient,
  Address,
  Hex,
} from "viem";
import type { writeContract } from "viem/actions";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  GenericSigner,
  ReadContractConfig,
  SignerLifecycleCallbacks,
  TransactionReceipt,
  WriteContractConfig,
} from "../token/token.types";
import { eip1193Subscribe } from "../token/eip1193-subscribe";

/**
 * Configuration for {@link ViemSigner}.
 *
 * The optional `ethereum` field is needed for `subscribe()` (EIP-1193
 * `accountsChanged` / `disconnect` events). It cannot be auto-extracted from
 * `walletClient` because viem's `custom(ethereum)` transport captures the
 * provider in a closure and does **not** expose `on` / `removeListener` on
 * `walletClient.transport`.
 *
 * If you omit `ethereum`, `subscribe()` returns a no-op. For automatic
 * wallet lifecycle handling, consider using `WagmiSigner` instead.
 */
export interface ViemSignerConfig {
  /** Wallet client for signing and write operations. Optional — omit for read-only usage. */
  walletClient?: WalletClient;
  publicClient: PublicClient;
  ethereum?: EIP1193Provider;
}

/**
 * GenericSigner backed by viem.
 *
 * @param config - {@link ViemSignerConfig} with walletClient and publicClient
 */
export class ViemSigner implements GenericSigner {
  readonly #walletClient?: WalletClient;
  readonly #publicClient: PublicClient;
  readonly #ethereum?: EIP1193Provider;

  constructor(config: ViemSignerConfig) {
    this.#walletClient = config.walletClient;
    this.#publicClient = config.publicClient;
    this.#ethereum = config.ethereum;
  }

  #requireWalletClient(): WalletClient {
    if (!this.#walletClient) {
      throw new TypeError("No walletClient configured — read-only mode");
    }
    return this.#walletClient;
  }

  #requireWalletAndAccount(): { walletClient: WalletClient; account: Account } {
    const walletClient = this.#requireWalletClient();
    if (!walletClient.account) {
      throw new TypeError("WalletClient has no account");
    }
    return { walletClient, account: walletClient.account };
  }

  async getChainId(): Promise<number> {
    return this.#publicClient.getChainId();
  }

  async getAddress(): Promise<Address> {
    return this.#requireWalletAndAccount().account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { walletClient, account } = this.#requireWalletAndAccount();
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return walletClient.signTypedData({
      account,
      primaryType: Object.keys(sigTypes)[0]!,
      types: sigTypes,
      domain: typedData.domain,
      message: typedData.message,
    });
  }

  async writeContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
    const TArgs extends ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    const { walletClient, account } = this.#requireWalletAndAccount();
    return walletClient.writeContract({
      chain: walletClient.chain,
      account,
      ...config,
    } as Parameters<typeof writeContract>[1]);
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

  subscribe(callbacks: SignerLifecycleCallbacks): () => void {
    if (!this.#walletClient) {
      return () => {};
    }
    return eip1193Subscribe(this.#ethereum, () => this.getAddress(), callbacks);
  }
}
