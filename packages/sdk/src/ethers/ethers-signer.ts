import { ethers, BrowserProvider, type Signer } from "ethers";
import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  Hex,
} from "viem";
import { getAddress, isHex, type Address } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  GenericSigner,
  ReadContractConfig,
  SignerLifecycleCallbacks,
  TransactionReceipt,
  WriteContractConfig,
} from "../token/token.types";
import { eip1193Subscribe } from "../token/eip1193-subscribe";
import type { EIP1193Provider } from "viem";

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
    return getAddress(await signer.getAddress());
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signer = await this.#requireSigner();
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const mutableSigTypes = Object.fromEntries(
      Object.entries(sigTypes).map(([key, fields]) => [key, [...fields]]),
    );
    const sig = await signer.signTypedData(domain, mutableSigTypes, message);
    if (!isHex(sig)) throw new TypeError(`Expected hex string, got: ${sig}`);
    return sig;
  }

  async writeContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
    const TArgs extends ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    const signer = await this.#requireSigner();
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    const overrides: { gasLimit?: bigint; value?: bigint } = {};
    if (config.value !== undefined) overrides.value = config.value;
    if (config.gas !== undefined) overrides.gasLimit = config.gas;
    const tx = await contract[config.functionName]!(
      ...(config.args as readonly unknown[]),
      overrides,
    );
    if (!isHex(tx.hash)) throw new TypeError(`Expected hex string, got: ${tx.hash}`);
    return tx.hash;
  }

  async readContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "pure" | "view">,
    const TArgs extends ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>> {
    const provider = this.#requireProvider();
    const contract = new ethers.Contract(
      config.address,
      config.abi as ethers.InterfaceAbi,
      provider,
    );
    return contract[config.functionName]!(...(config.args as readonly unknown[])) as Promise<
      ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>
    >;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const receipt = await this.#requireProvider().waitForTransaction(hash);
    if (!receipt) throw new Error("Transaction receipt not found");
    return {
      logs: receipt.logs.map((log) => ({
        topics: log.topics.filter((t): t is Hex => t !== null),
        data: log.data as Hex,
      })),
    };
  }

  subscribe(callbacks: SignerLifecycleCallbacks): () => void {
    return eip1193Subscribe(this.#eip1193, () => this.getAddress(), callbacks);
  }
}
