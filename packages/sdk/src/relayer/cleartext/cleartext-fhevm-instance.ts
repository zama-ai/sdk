import { privateKeyToAccount } from "viem/accounts";
import { concat, getAddress, hexToBigInt, pad, parseAbi, toHex } from "viem";
import type { PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";
import type { RelayerSDK } from "../relayer-sdk";
import type {
  Address,
  DecryptedValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptInput,
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
import { FheType, MOCK_KMS_SIGNER_PK } from "./constants";
import type { CleartextConfig } from "./types";

const KMS_SIGNER = privateKeyToAccount(MOCK_KMS_SIGNER_PK as `0x${string}`);

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
]);

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

const USER_DECRYPT_TYPES = {
  UserDecryptRequestVerification: USER_DECRYPT_EIP712.types
    .UserDecryptRequestVerification as unknown as Array<{ name: string; type: string }>,
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
const KMS_DECRYPTION_TYPES = {
  PublicDecryptVerification: KMS_DECRYPTION_EIP712.types
    .PublicDecryptVerification as unknown as Array<{ name: string; type: string }>,
};

type Hex = `0x${string}`;

function normalizeHandle(handle: string): Hex {
  return toHex(hexToBigInt(handle as Hex), { size: 32 });
}

function decodeDecryptedValue(handle: string, rawValue: bigint): DecryptedValue {
  const typeByte = Number((BigInt(handle) >> 8n) & 0xffn);
  if (typeByte === FheType.Bool) return rawValue !== 0n;
  if (typeByte === FheType.Uint160) return toHex(rawValue, { size: 20 });
  return rawValue;
}

export class CleartextFhevmInstance implements RelayerSDK {
  readonly #client: PublicClient;
  readonly #config: CleartextConfig;

  static readonly #FORBIDDEN_CHAIN_IDS = new Set([BigInt(mainnet.id), BigInt(sepolia.id)]);

  constructor(client: PublicClient, config: CleartextConfig) {
    if (CleartextFhevmInstance.#FORBIDDEN_CHAIN_IDS.has(config.chainId)) {
      throw new Error(
        `Cleartext mode is not allowed on chain ${config.chainId}. ` +
          `It is intended for local development and testing only.`,
      );
    }
    this.#client = client;
    this.#config = config;
  }

  async generateKeypair(): Promise<FHEKeypair> {
    const publicKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
    let privateKey = toHex(crypto.getRandomValues(new Uint8Array(32)));

    while (privateKey === publicKey) {
      privateKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
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

    for (const entry of params.values) {
      const { value, type } = entry as EncryptInput;
      switch (type) {
        case "ebool":
          input.addBool(value);
          break;
        case "euint8":
          input.add8(value as bigint);
          break;
        case "euint16":
          input.add16(value as bigint);
          break;
        case "euint32":
          input.add32(value as bigint);
          break;
        case "euint64":
          input.add64(value as bigint);
          break;
        case "euint128":
          input.add128(value as bigint);
          break;
        case "eaddress":
          input.addAddress(value as string);
          break;
        case "euint256":
          input.add256(value as bigint);
          break;
        default:
          throw new Error(`Unsupported FHE type: ${type satisfies never}`);
      }
    }

    return input.encrypt();
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, DecryptedValue>> {
    const normalizedSignerAddress = getAddress(params.signerAddress);
    const normalizedHandles = params.handles.map(normalizeHandle);

    const allowedResults = await Promise.all(
      normalizedHandles.map((handle) => this.#persistAllowed(handle, normalizedSignerAddress)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new Error(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not authorized for user decrypt`,
      );
    }

    return this.#decryptHandles(normalizedHandles);
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    const normalizedHandles = handles.map(normalizeHandle);

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

    const abiEncodedClearValues = concat(orderedValues.map((v) => pad(toHex(v), { size: 32 })));

    const signature = await KMS_SIGNER.signTypedData({
      domain: KMS_DECRYPTION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.contracts.verifyingDecryption,
      ) as {
        name: string;
        version: string;
        chainId: number | bigint;
        verifyingContract: Hex;
      },
      types: KMS_DECRYPTION_TYPES,
      primaryType: "PublicDecryptVerification",
      message: {
        ctHandles: normalizedHandles,
        decryptedResult: abiEncodedClearValues,
        extraData: "0x",
      },
    });

    const decryptionProof = concat([toHex(new Uint8Array([1])), signature]) as Address;

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

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Record<string, DecryptedValue>> {
    const normalizedHandles = params.handles.map(normalizeHandle);

    const delegatedResults = await Promise.all(
      normalizedHandles.map((handle) =>
        this.#isHandleDelegatedForUserDecryption(
          params.delegatorAddress,
          params.delegateAddress,
          params.contractAddress,
          handle,
        ),
      ),
    );
    const unauthorizedIndex = delegatedResults.findIndex((isDelegated) => !isDelegated);
    if (unauthorizedIndex !== -1) {
      throw new Error(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not delegated for user decryption (delegator=${params.delegatorAddress}, delegate=${params.delegateAddress}, contract=${params.contractAddress})`,
      );
    }

    return this.#decryptHandles(normalizedHandles);
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

  async #decryptHandles(normalizedHandles: Hex[]): Promise<Record<string, DecryptedValue>> {
    const values = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );

    return Object.fromEntries(
      normalizedHandles.map((handle, index) => [
        handle,
        decodeDecryptedValue(handle, values[index]!),
      ]),
    ) as Record<string, DecryptedValue>;
  }

  async #persistAllowed(handle: Hex, account: Hex): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.contracts.acl as Hex,
      abi: ACL_ABI,
      functionName: "persistAllowed",
      args: [handle, account],
    });
  }

  async #isAllowedForDecryption(handle: Hex): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.contracts.acl as Hex,
      abi: ACL_ABI,
      functionName: "isAllowedForDecryption",
      args: [handle],
    });
  }

  async #isHandleDelegatedForUserDecryption(
    delegator: string,
    delegate: string,
    contractAddress: string,
    handle: Hex,
  ): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.contracts.acl as Hex,
      abi: ACL_ABI,
      functionName: "isHandleDelegatedForUserDecryption",
      args: [delegator as Hex, delegate as Hex, contractAddress as Hex, handle],
    });
  }

  async #readPlaintext(handle: Hex): Promise<bigint> {
    return this.#client.readContract({
      address: this.#config.contracts.executor as Hex,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [handle],
    });
  }
}
