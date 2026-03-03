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
 * Two variants:
 *
 * - **Browser** — `{ ethereum }`: pass the raw EIP-1193 provider (e.g. `window.ethereum`).
 *   A `BrowserProvider` is created internally and `subscribe()` works automatically.
 *
 * - **Node / direct signer** — `{ signer }`: pass an ethers `Signer` (e.g. `Wallet`).
 *   `subscribe()` is not available since there is no EIP-1193 provider.
 */
export type EthersSignerConfig = { ethereum: EIP1193Provider } | { signer: Signer };

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
  private signerPromise: Promise<Signer>;
  private readonly provider?: EIP1193Provider;

  constructor(config: EthersSignerConfig) {
    if ("ethereum" in config) {
      this.signerPromise = new BrowserProvider(config.ethereum).getSigner();
      this.provider = config.ethereum;
    } else {
      this.signerPromise = Promise.resolve(config.signer);
    }
  }

  async getChainId(): Promise<number> {
    const signer = await this.signerPromise;
    const provider = signer.provider;
    if (!provider) throw new TypeError("Signer has no provider");
    const network = await provider.getNetwork();
    return Number(network.chainId);
  }

  async getAddress(): Promise<Address> {
    const signer = await this.signerPromise;
    return toHex(await signer.getAddress()) as Address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signer = await this.signerPromise;
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const sig = await signer.signTypedData(domain, sigTypes, message);
    return toHex(sig);
  }

  async writeContract<C extends ContractCallConfig>(config: C): Promise<Hex> {
    const signer = await this.signerPromise;
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    const overrides: Record<string, unknown> = {};
    if (config.value !== undefined) overrides.value = config.value;
    const tx = await contract[config.functionName]!(...config.args, overrides);
    return toHex(tx.hash);
  }

  async readContract<T, C extends ContractCallConfig>(config: C): Promise<T> {
    const signer = await this.signerPromise;
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    return contract[config.functionName]!(...config.args) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const signer = await this.signerPromise;
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

  subscribe(callbacks: SignerLifecycleCallbacks): () => void {
    return eip1193Subscribe(this.provider, () => this.getAddress(), callbacks);
  }
}
