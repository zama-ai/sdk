import type { Hex } from "../relayer/relayer-sdk.types";
import type { GenericSigner, ContractCallConfig, TransactionReceipt } from "../token/token.types";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import { ethers, type BrowserProvider, type Signer } from "ethers";

/**
 * GenericSigner backed by ethers.
 *
 * Accepts either a `BrowserProvider` (signer resolved lazily via `getSigner()`)
 * or a `Signer` directly (e.g. `Wallet` for Node.js scripts).
 */
export class EthersSigner implements GenericSigner {
  private signerPromise: Promise<Signer>;

  constructor(providerOrSigner: BrowserProvider | Signer) {
    if ("getSigner" in providerOrSigner) {
      this.signerPromise = providerOrSigner.getSigner();
    } else {
      this.signerPromise = Promise.resolve(providerOrSigner);
    }
  }

  async getAddress(): Promise<Hex> {
    const signer = await this.signerPromise;
    return signer.getAddress() as unknown as Hex;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signer = await this.signerPromise;
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const sig = await signer.signTypedData(domain, sigTypes, message);
    return sig as Hex;
  }

  async writeContract<C extends ContractCallConfig>(config: C): Promise<Hex> {
    const signer = await this.signerPromise;
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    const tx = await contract[config.functionName](...config.args, {
      value: config.value,
    });
    return tx.hash as Hex;
  }

  async readContract<T, C extends ContractCallConfig>(config: C): Promise<T> {
    const signer = await this.signerPromise;
    const contract = new ethers.Contract(config.address, config.abi as ethers.InterfaceAbi, signer);
    return contract[config.functionName](...config.args) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const signer = await this.signerPromise;
    const provider = signer.provider;
    if (!provider) throw new TypeError("Signer has no provider");
    const receipt = await provider.waitForTransaction(hash);
    if (!receipt) throw new Error("Transaction receipt not found");
    return receipt;
  }
}
