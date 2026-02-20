import type { Address } from "../relayer/relayer-sdk.types";
import type {
  ConfidentialSigner,
  ContractCallConfig,
  TransactionReceipt,
} from "../token/confidential-token.types";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import { ethers, type Signer } from "ethers";

/**
 * ConfidentialSigner backed by ethers.
 *
 * @param signer - ethers Signer
 */
export class EthersSigner implements ConfidentialSigner {
  private readonly signer: Signer;

  constructor(signer: Signer) {
    this.signer = signer;
  }

  async getAddress(): Promise<Address> {
    return this.signer.getAddress() as unknown as Address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Address> {
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const sig = await this.signer.signTypedData(domain, sigTypes, message);
    return sig as Address;
  }

  async writeContract<C extends ContractCallConfig>(
    config: C,
  ): Promise<Address> {
    const contract = new ethers.Contract(
      config.address,
      config.abi as ethers.InterfaceAbi,
      this.signer,
    );
    const tx = await contract[config.functionName](...config.args, {
      value: config.value,
    });
    return tx.hash as Address;
  }

  async readContract<T, C extends ContractCallConfig>(config: C): Promise<T> {
    const contract = new ethers.Contract(
      config.address,
      config.abi as ethers.InterfaceAbi,
      this.signer,
    );
    return contract[config.functionName](...config.args) as Promise<T>;
  }

  async waitForTransactionReceipt(hash: Address): Promise<TransactionReceipt> {
    const provider = this.signer.provider;
    if (!provider) throw new TypeError("Signer has no provider");
    const receipt = await provider.waitForTransaction(hash);
    if (!receipt) throw new Error("Transaction receipt not found");
    return receipt;
  }
}
