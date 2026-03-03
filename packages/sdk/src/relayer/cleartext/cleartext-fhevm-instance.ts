import { ethers } from "ethers";
import type { RelayerSDK } from "../relayer-sdk";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  UserDecryptParams,
  ZKProofLike,
} from "../relayer-sdk.types";
import { MOCK_KMS_SIGNER_PK } from "./constants";
import { KMS_DECRYPTION_EIP712, USER_DECRYPT_EIP712 } from "./eip712";
import { CleartextEncryptedInput } from "./encrypted-input";
import type { CleartextFhevmConfig } from "./types";

export const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
] as const;

export const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"] as const;

const ACL_INTERFACE = new ethers.Interface(ACL_ABI);
const EXECUTOR_INTERFACE = new ethers.Interface(EXECUTOR_ABI);
const USER_DECRYPT_TYPES: Record<string, ethers.TypedDataField[]> = {
  UserDecryptRequestVerification: USER_DECRYPT_EIP712.types.UserDecryptRequestVerification.map(
    (field) => ({ ...field }),
  ),
};
const KMS_DECRYPTION_TYPES: Record<string, ethers.TypedDataField[]> = {
  PublicDecryptVerification: KMS_DECRYPTION_EIP712.types.PublicDecryptVerification.map((field) => ({
    ...field,
  })),
};

type RpcLike = Pick<ethers.JsonRpcProvider, "send">;

export class CleartextFhevmInstance implements RelayerSDK {
  readonly #provider: RpcLike;
  readonly #config: CleartextFhevmConfig;

  constructor(provider: RpcLike, config: CleartextFhevmConfig) {
    this.#provider = provider;
    this.#config = config;
  }

  async generateKeypair(): Promise<FHEKeypair> {
    const publicKey = ethers.hexlify(ethers.randomBytes(32));
    let privateKey = ethers.hexlify(ethers.randomBytes(32));

    while (privateKey === publicKey) {
      privateKey = ethers.hexlify(ethers.randomBytes(32));
    }

    return { publicKey, privateKey };
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const domain: EIP712TypedData["domain"] = {
      name: "Decryption",
      version: "1",
      chainId: Number(this.#config.chainId),
      verifyingContract: this.#config.verifyingContractAddressDecryption as Address,
    };

    return {
      domain,
      types: USER_DECRYPT_TYPES,
      message: {
        publicKey,
        contractAddresses,
        startTimestamp: BigInt(startTimestamp),
        durationDays: BigInt(durationDays),
        extraData: "0x00",
      },
    };
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const input = new CleartextEncryptedInput(
      params.contractAddress,
      params.userAddress,
      this.#config,
    );

    for (const value of params.values) {
      input.add64(value);
    }

    return input.encrypt();
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    const normalizedSignerAddress = ethers.getAddress(params.signerAddress);
    const normalizedHandles = params.handles.map((handle) =>
      ethers.toBeHex(ethers.toBigInt(handle), 32),
    );

    const allowedResults = await Promise.all(
      normalizedHandles.map((handle) => this.#persistAllowed(handle, normalizedSignerAddress)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new Error(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not authorized for user decrypt`,
      );
    }

    const values = await Promise.all(normalizedHandles.map((handle) => this.#readPlaintext(handle)));

    return Object.fromEntries(
      normalizedHandles.map((handle, index) => [handle, values[index]!]),
    ) as Record<string, bigint>;
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    const normalizedHandles = handles.map((handle) => ethers.toBeHex(ethers.toBigInt(handle), 32));

    const allowedResults = await Promise.all(
      normalizedHandles.map((handle) => this.#isAllowedForDecryption(handle)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new Error(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not allowed for public decryption`,
      );
    }

    const orderedValues = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );
    const clearValues = Object.fromEntries(
      normalizedHandles.map((handle, index) => [handle, orderedValues[index]!]),
    ) as Record<string, bigint>;

    // Clear values are encoded as a concatenation of 32-byte words.
    const abiEncodedClearValues = ethers.hexlify(
      ethers.concat(orderedValues.map((v) => ethers.zeroPadValue(ethers.toBeHex(v), 32))),
    );

    const kmsSigner = new ethers.Wallet(MOCK_KMS_SIGNER_PK);
    const signature = await kmsSigner.signTypedData(
      KMS_DECRYPTION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.verifyingContractAddressDecryption,
      ),
      KMS_DECRYPTION_TYPES,
      {
        ctHandles: normalizedHandles,
        decryptedResult: abiEncodedClearValues,
        extraData: "0x",
      },
    );

    const decryptionProof = ethers.hexlify(
      ethers.concat([new Uint8Array([1]), ethers.getBytes(signature)]),
    ) as Address;

    return {
      clearValues,
      abiEncodedClearValues,
      decryptionProof,
    };
  }

  async createDelegatedUserDecryptEIP712(
    _publicKey: string,
    _contractAddresses: Address[],
    _delegatorAddress: string,
    _startTimestamp: number,
    _durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    throw new Error("Not implemented in cleartext mode");
  }

  async delegatedUserDecrypt(
    _params: DelegatedUserDecryptParams,
  ): Promise<Record<string, bigint>> {
    throw new Error("Not implemented in cleartext mode");
  }

  async requestZKProofVerification(_zkProof: ZKProofLike): Promise<InputProofBytesType> {
    throw new Error("Not implemented in cleartext mode");
  }

  async getPublicKey(): Promise<{ publicKeyId: string; publicKey: Uint8Array } | null> {
    return null;
  }

  async getPublicParams(
    _bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return null;
  }

  terminate(): void {
    // No resources to release in cleartext mode.
  }

  async #persistAllowed(handle: string, account: string): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("persistAllowed", [handle, account]);
    const result = await this.#ethCall(this.#config.aclAddress, data);
    return ACL_INTERFACE.decodeFunctionResult("persistAllowed", result)[0];
  }

  async #isAllowedForDecryption(handle: string): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("isAllowedForDecryption", [handle]);
    const result = await this.#ethCall(this.#config.aclAddress, data);
    return ACL_INTERFACE.decodeFunctionResult("isAllowedForDecryption", result)[0];
  }

  async #readPlaintext(handle: string): Promise<bigint> {
    const data = EXECUTOR_INTERFACE.encodeFunctionData("plaintexts", [handle]);
    const result = await this.#ethCall(this.#config.executorProxyAddress, data);
    return EXECUTOR_INTERFACE.decodeFunctionResult("plaintexts", result)[0];
  }

  async #ethCall(to: string, data: string): Promise<string> {
    return (await this.#provider.send("eth_call", [{ to, data }, "latest"])) as string;
  }
}
