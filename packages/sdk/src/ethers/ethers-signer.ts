import type {
  GenericSigner,
  ContractCallConfig,
  TransactionReceipt,
  Hex,
  SignerChangeEvent,
  ReactiveSignerMixin,
} from "../token/token.types";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
import { ethers, type BrowserProvider, type Signer } from "ethers";
import type { Eip1193Provider } from "ethers";

/** Validate and narrow a string to the `Hex` branded type. */
function toHex(s: string): Hex {
  if (!s.startsWith("0x")) throw new TypeError(`Expected hex string, got: ${s}`);
  return s as Hex;
}

/** Static configuration: pre-built ethers provider or signer. */
export interface EthersStaticSignerConfig {
  signer: BrowserProvider | Signer;
}

/** EIP-1193 configuration: reactive signer built from a wallet provider. */
export interface EthersEIP1193SignerConfig {
  ethereum: Eip1193Provider & {
    on(event: string, handler: (...args: unknown[]) => void): void;
    removeListener(event: string, handler: (...args: unknown[]) => void): void;
  };
}

/** Configuration for {@link EthersSigner}. */
export type EthersSignerConfig = EthersStaticSignerConfig | EthersEIP1193SignerConfig;

function isEIP1193Config(config: EthersSignerConfig): config is EthersEIP1193SignerConfig {
  return "ethereum" in config;
}

/**
 * GenericSigner backed by ethers.
 *
 * Supports two modes:
 * - **Static**: pass a `BrowserProvider` (signer resolved lazily via `getSigner()`)
 *   or a `Signer` directly (e.g. `Wallet` for Node.js scripts).
 * - **EIP-1193**: pass an `ethereum` provider — a `BrowserProvider` is created
 *   automatically and re-resolved on `accountsChanged` / `chainChanged` events.
 *
 * In both modes, `subscribe()` is available (no-op in static mode).
 * The returned unsubscribe function detaches EIP-1193 listeners when the last listener is removed.
 */
export class EthersSigner implements GenericSigner, ReactiveSignerMixin {
  #signerPromise: Promise<Signer>;
  #ethereum: EthersEIP1193SignerConfig["ethereum"] | null = null;
  #listeners = new Set<(event: SignerChangeEvent) => void>();
  // Bound handlers for EIP-1193 event cleanup
  #handleAccountsChanged: ((accounts: unknown) => void) | null = null;
  #handleChainChanged: ((chainId: unknown) => void) | null = null;
  #handleDisconnect: (() => void) | null = null;

  constructor(config: EthersSignerConfig) {
    if (isEIP1193Config(config)) {
      this.#ethereum = config.ethereum;
      this.#signerPromise = this.#buildSigner();
      this.#attachEvents();
    } else {
      const providerOrSigner = config.signer;
      if ("getSigner" in providerOrSigner) {
        this.#signerPromise = providerOrSigner.getSigner();
      } else {
        this.#signerPromise = Promise.resolve(providerOrSigner);
      }
    }
  }

  async getChainId(): Promise<number> {
    const signer = await this.#signerPromise;
    const provider = signer.provider;
    if (!provider) throw new TypeError("Signer has no provider");
    const network = await provider.getNetwork();
    return Number(network.chainId);
  }

  async getAddress(): Promise<Address> {
    const signer = await this.#signerPromise;
    return toHex(await signer.getAddress()) as Address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signer = await this.#signerPromise;
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const sig = await signer.signTypedData(domain, sigTypes, message);
    return toHex(sig);
  }

  async writeContract<C extends ContractCallConfig>(config: C): Promise<Hex> {
    const signer = await this.#signerPromise;
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    const overrides: Record<string, unknown> = {};
    if (config.value !== undefined) overrides.value = config.value;
    const tx = await contract[config.functionName]!(...config.args, overrides);
    return toHex(tx.hash);
  }

  async readContract<T, C extends ContractCallConfig>(config: C): Promise<T> {
    const signer = await this.#signerPromise;
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    return contract[config.functionName]!(...config.args) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const signer = await this.#signerPromise;
    const provider = signer.provider;
    if (!provider) throw new TypeError("Signer has no provider");
    const receipt = await provider.waitForTransaction(hash);
    if (!receipt) throw new Error("Transaction receipt not found");
    return {
      logs: receipt.logs.map((log) => ({
        topics: log.topics.filter((t): t is string => t !== null),
        data: log.data,
      })),
    };
  }

  subscribe(listener: (event: SignerChangeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#detachEvents();
    };
  }

  // ── Private helpers ──────────────────────────────────────

  #buildSigner(): Promise<Signer> {
    const provider = new ethers.BrowserProvider(this.#ethereum!);
    return provider.getSigner();
  }

  #rebuild(): void {
    this.#signerPromise = this.#buildSigner();
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
