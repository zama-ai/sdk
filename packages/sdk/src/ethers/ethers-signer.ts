import { ethers, type BrowserProvider, type Signer } from "ethers";
import type { Address, EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractCallConfig,
  GenericSigner,
  Hex,
  SignerLifecycleCallbacks,
  TransactionReceipt,
} from "../token/token.types";
import { EIP1193Provider } from "./ethers.types";

/** Validate and narrow a string to the `Hex` branded type. */
function toHex(s: string): Hex {
  if (!s.startsWith("0x")) throw new TypeError(`Expected hex string, got: ${s}`);
  return s as Hex;
}

/** Configuration for {@link EthersSigner}. */
export interface EthersSignerConfig {
  signer: BrowserProvider | Signer;
  provider?: EIP1193Provider;
}

/**
 * GenericSigner backed by ethers.
 *
 * Accepts either a `BrowserProvider` (signer resolved lazily via `getSigner()`)
 * or a `Signer` directly (e.g. `Wallet` for Node.js scripts).
 *
 * @param config - {@link EthersSignerConfig} with signer or provider
 */
export class EthersSigner implements GenericSigner {
  private signerPromise: Promise<Signer>;
  private readonly provider?: EIP1193Provider;

  constructor(config: EthersSignerConfig) {
    const providerOrSigner = config.signer;
    if ("getSigner" in providerOrSigner) {
      this.signerPromise = providerOrSigner.getSigner();
    } else {
      this.signerPromise = Promise.resolve(providerOrSigner);
    }
    this.provider = config.provider;
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

    const handleAccountsChanged = (accounts: Address[]) => {
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
