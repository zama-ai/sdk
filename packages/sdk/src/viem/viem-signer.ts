import type {
  Account,
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  EIP1193Provider,
  PublicClient,
  WalletClient,
  Address,
  Hex,
} from "viem";
import type { writeContract } from "viem/actions";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type { GenericSigner, SignerLifecycleCallbacks, WriteContractConfig } from "../types";
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
  /** Wallet client for signing and write operations. */
  walletClient: WalletClient;
  /**
   * Public client used to read the wallet's active chain ID. Required because
   * `WalletClient.getChainId()` may not reflect the most recent chain switch
   * in every viem version.
   */
  publicClient: PublicClient;
  ethereum?: EIP1193Provider;
}

/**
 * GenericSigner backed by viem.
 *
 * @param config - {@link ViemSignerConfig} with walletClient and publicClient
 */
export class ViemSigner implements GenericSigner {
  readonly #walletClient: WalletClient;
  readonly #publicClient: PublicClient;
  readonly #ethereum?: EIP1193Provider;

  constructor(config: ViemSignerConfig) {
    this.#walletClient = config.walletClient;
    this.#publicClient = config.publicClient;
    this.#ethereum = config.ethereum;
  }

  #requireAccount(): { walletClient: WalletClient; account: Account } {
    if (!this.#walletClient.account) {
      throw new TypeError("WalletClient has no account");
    }
    return { walletClient: this.#walletClient, account: this.#walletClient.account };
  }

  async getChainId(): Promise<number> {
    return this.#publicClient.getChainId();
  }

  async getAddress(): Promise<Address> {
    return this.#requireAccount().account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { walletClient, account } = this.#requireAccount();
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return walletClient.signTypedData({
      account,
      primaryType: typedData.primaryType,
      types: sigTypes,
      domain: typedData.domain,
      message: {
        ...typedData.message,
        startTimestamp: BigInt(typedData.message.startTimestamp),
        durationDays: BigInt(typedData.message.durationDays),
      },
      // Cast: EIP712TypedData is a union; viem cannot correlate primaryType/types/message across union members, so the inferred `message` collapses to `never`.
    } as Parameters<typeof walletClient.signTypedData>[0]);
  }

  async writeContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
    const TArgs extends ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    const { walletClient, account } = this.#requireAccount();
    return walletClient.writeContract({
      chain: walletClient.chain,
      account,
      ...config,
    } as Parameters<typeof writeContract>[1]);
  }

  subscribe(callbacks: SignerLifecycleCallbacks): () => void {
    return eip1193Subscribe(this.#ethereum, () => this.getAddress(), callbacks);
  }
}
