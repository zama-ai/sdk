import type {
  GenericSigner,
  ContractCallConfig,
  TransactionReceipt,
  Hex,
  SignerChangeEvent,
  ReactiveSignerMixin,
} from "../token/token.types";
import type { PublicClient, WalletClient, Chain, EIP1193Provider } from "viem";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { writeContract } from "viem/actions";

/** Static configuration: pre-built viem clients. */
export interface ViemStaticSignerConfig {
  walletClient: WalletClient;
  publicClient: PublicClient;
}

/** EIP-1193 configuration: reactive signer built from a wallet provider. */
export interface ViemEIP1193SignerConfig {
  ethereum: EIP1193Provider;
  chain: Chain;
  rpcUrl?: string;
}

/** Configuration for {@link ViemSigner}. */
export type ViemSignerConfig = ViemStaticSignerConfig | ViemEIP1193SignerConfig;

function isEIP1193Config(config: ViemSignerConfig): config is ViemEIP1193SignerConfig {
  return "ethereum" in config;
}

/**
 * GenericSigner backed by viem.
 *
 * Supports two modes:
 * - **Static**: pass pre-built `walletClient` and `publicClient`.
 * - **EIP-1193**: pass an `ethereum` provider — clients are built automatically
 *   and rebuilt on `accountsChanged` / `chainChanged` events.
 *
 * In both modes, `subscribe()` is available (no-op in static mode).
 * The returned unsubscribe function detaches EIP-1193 listeners when the last listener is removed.
 */
export class ViemSigner implements GenericSigner, ReactiveSignerMixin {
  #walletClient: WalletClient;
  #publicClient: PublicClient;
  #ethereum: EIP1193Provider | null = null;
  #chain: Chain | null = null;
  #rpcUrl: string | undefined;
  #listeners = new Set<(event: SignerChangeEvent) => void>();
  // Bound handlers for EIP-1193 event cleanup
  #handleAccountsChanged: ((accounts: unknown) => void) | null = null;
  #handleChainChanged: ((chainId: unknown) => void) | null = null;
  #handleDisconnect: (() => void) | null = null;

  constructor(config: ViemSignerConfig) {
    if (isEIP1193Config(config)) {
      this.#ethereum = config.ethereum;
      this.#chain = config.chain;
      this.#rpcUrl = config.rpcUrl;
      this.#walletClient = this.#buildWalletClient();
      this.#publicClient = this.#buildPublicClient();
      this.#attachEvents();
    } else {
      this.#walletClient = config.walletClient;
      this.#publicClient = config.publicClient;
    }
  }

  async getChainId(): Promise<number> {
    return this.#publicClient.getChainId();
  }

  async getAddress(): Promise<Address> {
    const account = this.#walletClient.account;
    if (account) return account.address;

    // EIP-1193 mode: walletClient may not have an account set yet
    if (this.#ethereum) {
      const accounts = (await this.#ethereum.request({ method: "eth_accounts" })) as string[];
      if (accounts.length > 0) return accounts[0] as Address;
    }

    throw new TypeError("Invalid address");
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const account = this.#walletClient.account;
    if (!account) throw new TypeError("WalletClient has no account");
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return this.#walletClient.signTypedData({
      account,
      primaryType: Object.keys(sigTypes)[0]!,
      types: sigTypes,
      domain: typedData.domain,
      message: typedData.message,
    });
  }

  async writeContract<C extends ContractCallConfig = ContractCallConfig>(config: C): Promise<Hex> {
    const account = this.#walletClient.account;
    if (!account) throw new TypeError("WalletClient has no account");
    return this.#walletClient.writeContract({
      chain: this.#walletClient.chain,
      account,
      ...config,
    } as Parameters<typeof writeContract>[1]);
  }

  async readContract<T, C extends ContractCallConfig = ContractCallConfig>(config: C): Promise<T> {
    return this.#publicClient.readContract(config) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    return this.#publicClient.waitForTransactionReceipt({ hash });
  }

  subscribe(listener: (event: SignerChangeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#detachEvents();
    };
  }

  // ── Private helpers ──────────────────────────────────────

  #buildWalletClient(): WalletClient {
    return createWalletClient({
      chain: this.#chain!,
      transport: custom(this.#ethereum!),
    });
  }

  #buildPublicClient(): PublicClient {
    return createPublicClient({
      chain: this.#chain!,
      transport: this.#rpcUrl ? http(this.#rpcUrl) : custom(this.#ethereum!),
    });
  }

  #rebuild(): void {
    this.#walletClient = this.#buildWalletClient();
    this.#publicClient = this.#buildPublicClient();
  }

  #emit(event: SignerChangeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #attachEvents(): void {
    const ethereum = this.#ethereum!;

    this.#handleAccountsChanged = (accounts: unknown) => {
      this.#rebuild();
      this.#emit({ type: "accountsChanged", accounts: accounts as string[] });
    };

    this.#handleChainChanged = (chainId: unknown) => {
      this.#rebuild();
      this.#emit({ type: "chainChanged", chainId: chainId as string });
    };

    this.#handleDisconnect = () => {
      this.#emit({ type: "disconnect" });
    };

    ethereum.on("accountsChanged", this.#handleAccountsChanged);
    ethereum.on("chainChanged", this.#handleChainChanged);
    ethereum.on("disconnect", this.#handleDisconnect);
  }

  #detachEvents(): void {
    if (!this.#ethereum) return;
    if (this.#handleAccountsChanged) {
      this.#ethereum.removeListener("accountsChanged", this.#handleAccountsChanged);
      this.#handleAccountsChanged = null;
    }
    if (this.#handleChainChanged) {
      this.#ethereum.removeListener("chainChanged", this.#handleChainChanged);
      this.#handleChainChanged = null;
    }
    if (this.#handleDisconnect) {
      this.#ethereum.removeListener("disconnect", this.#handleDisconnect);
      this.#handleDisconnect = null;
    }
  }
}
