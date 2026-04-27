import type {
  Account,
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  EIP1193Provider,
  WalletClient,
  Address,
  Hex,
} from "viem";
import { getAddress } from "viem";
import type { writeContract } from "viem/actions";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  GenericSigner,
  SignerIdentity,
  SignerIdentityListener,
  WriteContractConfig,
} from "../types";
import { eip1193Subscribe } from "../signer/eip1193-subscribe";

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
  ethereum?: EIP1193Provider;
}

function identityFromWalletClient(walletClient: WalletClient): SignerIdentity | undefined {
  if (!walletClient.account || !walletClient.chain) {
    return undefined;
  }
  const address =
    typeof walletClient.account === "string" ? walletClient.account : walletClient.account.address;
  return {
    address: getAddress(address),
    chainId: walletClient.chain.id,
  };
}

/**
 * GenericSigner backed by viem.
 */
export class ViemSigner implements GenericSigner {
  readonly #walletClient: WalletClient;
  readonly #ethereum?: EIP1193Provider;

  /**
   * @param config - {@link ViemSignerConfig} with walletClient and optional ethereum provider
   */
  constructor(config: ViemSignerConfig) {
    this.#walletClient = config.walletClient;
    this.#ethereum = config.ethereum;
  }

  #requireAccount(): { walletClient: WalletClient; account: Account } {
    if (!this.#walletClient.account) {
      throw new TypeError("WalletClient has no account");
    }
    return { walletClient: this.#walletClient, account: this.#walletClient.account };
  }

  async getChainId(): Promise<number> {
    return this.#walletClient.getChainId();
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

  subscribe(onIdentityChange: SignerIdentityListener): () => void {
    return eip1193Subscribe({
      provider: this.#ethereum,
      getInitialIdentity: () => identityFromWalletClient(this.#walletClient),
      onIdentityChange,
    });
  }
}
