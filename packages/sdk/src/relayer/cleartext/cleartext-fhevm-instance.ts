import { ethers } from "ethers";
import { mainnet, sepolia } from "viem/chains";
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
import {
  DELEGATED_USER_DECRYPT_EIP712,
  KMS_DECRYPTION_EIP712,
  USER_DECRYPT_EIP712,
} from "./eip712";
import { CleartextEncryptedInput } from "./encrypted-input";
import { MOCK_KMS_SIGNER_PK } from "./constants";
import type { CleartextConfig } from "./types";

export const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
] as const;

export const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"] as const;

const ACL_INTERFACE = new ethers.Interface(ACL_ABI);
const EXECUTOR_INTERFACE = new ethers.Interface(EXECUTOR_ABI);
const USER_DECRYPT_TYPES: Record<string, ethers.TypedDataField[]> = {
  UserDecryptRequestVerification: USER_DECRYPT_EIP712.types.UserDecryptRequestVerification.map(
    (field) => ({ ...field }),
  ),
};
const DELEGATED_USER_DECRYPT_TYPES: KmsDelegatedUserDecryptEIP712Type["types"] = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  DelegatedUserDecryptRequestVerification:
    DELEGATED_USER_DECRYPT_EIP712.types.DelegatedUserDecryptRequestVerification,
};
const KMS_DECRYPTION_TYPES: Record<string, ethers.TypedDataField[]> = {
  PublicDecryptVerification: KMS_DECRYPTION_EIP712.types.PublicDecryptVerification.map((field) => ({
    ...field,
  })),
};

type RpcLike = Pick<ethers.JsonRpcProvider, "send">;

export class CleartextFhevmInstance implements RelayerSDK {
  readonly #provider: RpcLike;
  readonly #config: CleartextConfig;

  static readonly #FORBIDDEN_CHAIN_IDS = new Set([BigInt(mainnet.id), BigInt(sepolia.id)]);

  constructor(provider: RpcLike, config: CleartextConfig) {
    if (CleartextFhevmInstance.#FORBIDDEN_CHAIN_IDS.has(config.chainId)) {
      throw new Error(
        `Cleartext mode is not allowed on chain ${config.chainId}. ` +
          `It is intended for local development and testing only.`,
      );
    }
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
      verifyingContract: this.#config.contracts.verifyingDecryption as Address,
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

    const values = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );

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
        this.#config.contracts.verifyingDecryption,
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
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const domain: KmsDelegatedUserDecryptEIP712Type["domain"] = {
      name: "Decryption",
      version: "1",
      chainId: this.#config.chainId,
      verifyingContract: this.#config.contracts.verifyingDecryption as Address,
    };
    const message: KmsDelegatedUserDecryptEIP712Type["message"] = {
      publicKey: publicKey as KmsDelegatedUserDecryptEIP712Type["message"]["publicKey"],
      contractAddresses:
        contractAddresses as KmsDelegatedUserDecryptEIP712Type["message"]["contractAddresses"],
      delegatorAddress:
        delegatorAddress as KmsDelegatedUserDecryptEIP712Type["message"]["delegatorAddress"],
      startTimestamp: String(startTimestamp),
      durationDays: String(durationDays),
      extraData: "0x00" as KmsDelegatedUserDecryptEIP712Type["message"]["extraData"],
    };

    return {
      domain,
      types: DELEGATED_USER_DECRYPT_TYPES,
      primaryType: "DelegatedUserDecryptRequestVerification",
      message,
    };
  }

  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    const normalizedHandles = params.handles.map((handle) =>
      ethers.toBeHex(ethers.toBigInt(handle), 32),
    );

    for (const handle of normalizedHandles) {
      const isDelegated = await this.#isHandleDelegatedForUserDecryption(
        params.delegatorAddress,
        params.delegateAddress,
        params.contractAddress,
        handle,
      );
      if (!isDelegated) {
        throw new Error(
          `Handle ${handle} is not delegated for user decryption (delegator=${params.delegatorAddress}, delegate=${params.delegateAddress}, contract=${params.contractAddress})`,
        );
      }
    }

    const values = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );

    return Object.fromEntries(
      normalizedHandles.map((handle, index) => [handle, values[index]!]),
    ) as Record<string, bigint>;
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
    const result = await this.#ethCall(this.#config.contracts.acl, data);
    return ACL_INTERFACE.decodeFunctionResult("persistAllowed", result)[0];
  }

  async #isAllowedForDecryption(handle: string): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("isAllowedForDecryption", [handle]);
    const result = await this.#ethCall(this.#config.contracts.acl, data);
    return ACL_INTERFACE.decodeFunctionResult("isAllowedForDecryption", result)[0];
  }

  async #isHandleDelegatedForUserDecryption(
    delegator: string,
    delegate: string,
    contractAddress: string,
    handle: string,
  ): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("isHandleDelegatedForUserDecryption", [
      delegator,
      delegate,
      contractAddress,
      handle,
    ]);
    const result = await this.#ethCall(this.#config.contracts.acl, data);
    return ACL_INTERFACE.decodeFunctionResult("isHandleDelegatedForUserDecryption", result)[0];
  }

  async #readPlaintext(handle: string): Promise<bigint> {
    const data = EXECUTOR_INTERFACE.encodeFunctionData("plaintexts", [handle]);
    const result = await this.#ethCall(this.#config.contracts.executor, data);
    return EXECUTOR_INTERFACE.decodeFunctionResult("plaintexts", result)[0];
  }

  async #ethCall(to: string, data: string): Promise<string> {
    return (await this.#provider.send("eth_call", [{ to, data }, "latest"])) as string;
  }
}
