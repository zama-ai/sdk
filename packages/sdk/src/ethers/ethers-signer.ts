import { ethers, BrowserProvider, type Signer } from "ethers";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractCallConfig,
  GenericSigner,
  Hex,
  SignerLifecycleCallbacks,
  TransactionReceipt,
} from "../token/token.types";
import { eip1193Subscribe } from "../token/eip1193-subscribe";
import { EIP1193Provider } from "./ethers.types";

/** Validate and narrow a string to the `Hex` branded type. */
function toHex(s: string): Hex {
  if (!s.startsWith("0x")) throw new TypeError(`Expected hex string, got: ${s}`);
  return s as Hex;
}

/**
 * Configuration for {@link EthersSigner}.
 *
 * Three variants:
 *
 * - **Browser** — `{ ethereum }`: pass the raw EIP-1193 provider (e.g. `window.ethereum`).
 *   A `BrowserProvider` is created internally and `subscribe()` works automatically.
 *
 * - **Node / direct signer** — `{ signer }`: pass an ethers `Signer` (e.g. `Wallet`).
 *   `subscribe()` is not available since there is no EIP-1193 provider.
 *
 * - **Read-only** — `{ provider }`: pass an ethers `Provider` for read-only contract calls.
 *   Signing and write operations will throw at runtime.
 */
export type EthersSignerConfig =
  | { ethereum: EIP1193Provider }
  | { signer: Signer }
  | { provider: ethers.Provider };

/**
 * GenericSigner backed by ethers.
 *
 * Accepts either a raw EIP-1193 provider (`{ ethereum }`) which creates a
 * `BrowserProvider` internally, or a `Signer` directly (`{ signer }`)
 * for Node.js scripts.
 *
 * @param config - {@link EthersSignerConfig}
 */
export class EthersSigner implements GenericSigner {
  #signerPromise?: Promise<Signer>;
  readonly #readProvider?: ethers.Provider;
  readonly #eip1193?: EIP1193Provider;

  constructor(config: EthersSignerConfig) {
    if ("ethereum" in config) {
      const browserProvider = new BrowserProvider(config.ethereum);
      this.#signerPromise = browserProvider.getSigner();
      this.#readProvider = browserProvider;
      this.#eip1193 = config.ethereum;
    } else if ("signer" in config) {
      this.#signerPromise = Promise.resolve(config.signer);
      this.#readProvider = config.signer.provider ?? undefined;
    } else {
      this.#readProvider = config.provider;
    }
  }

  async #requireSigner(): Promise<Signer> {
    if (!this.#signerPromise) throw new TypeError("No signer configured — read-only mode");
    return this.#signerPromise;
  }

  #requireProvider(): ethers.Provider {
    if (!this.#readProvider) throw new TypeError("Signer has no provider");
    return this.#readProvider;
  }

  async getChainId(): Promise<number> {
    const network = await this.#requireProvider().getNetwork();
    return Number(network.chainId);
  }

  async getAddress(): Promise<Address> {
    const signer = await this.#requireSigner();
    return toHex(await signer.getAddress()) as Address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signer = await this.#requireSigner();
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const sig = await signer.signTypedData(domain, sigTypes, message);
    return toHex(sig);
  }

  async writeContract<C extends ContractCallConfig>(config: C): Promise<Hex> {
    const signer = await this.#requireSigner();
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    const overrides: Record<string, unknown> = {};
    if (config.value !== undefined) overrides.value = config.value;
    const tx = await contract[config.functionName]!(...config.args, overrides);
    return toHex(tx.hash);
  }

  async readContract<T, C extends ContractCallConfig>(config: C): Promise<T> {
    const provider = this.#requireProvider();
    const contract = new ethers.Contract(
      config.address,
      config.abi as ethers.InterfaceAbi,
      provider,
    );
    return contract[config.functionName]!(...config.args) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const receipt = await this.#requireProvider().waitForTransaction(hash);
    if (!receipt) throw new Error("Transaction receipt not found");
    return {
      logs: receipt.logs.map((log) => ({
        topics: log.topics.filter((t): t is string => t !== null),
        data: log.data,
      })),
    };
  }

  subscribe(callbacks: SignerLifecycleCallbacks): () => void {
    return eip1193Subscribe(this.#eip1193, () => this.getAddress(), callbacks);
  }
}
