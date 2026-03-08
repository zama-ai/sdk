import { privateKeyToAccount } from "viem/accounts";
import {
  concat,
  createPublicClient,
  custom,
  getAddress,
  http,
  keccak256,
  pad,
  parseAbi,
  toBytes,
  toHex,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  KmsPublicDecryptEIP712Type,
  KmsUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { RelayerSDK } from "../relayer-sdk";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  UserDecryptParams,
} from "../relayer-sdk.types";
import {
  DELEGATED_USER_DECRYPT_EIP712,
  INPUT_VERIFICATION_EIP712,
  KMS_DECRYPTION_EIP712,
  USER_DECRYPT_EIP712,
} from "./eip712";
import { MOCK_INPUT_SIGNER_PK, MOCK_KMS_SIGNER_PK } from "./constants";
import {
  encryptionBitsFromFheTypeId,
  fheTypeIdFromName,
  isFheTypeName,
  type FheTypeId,
} from "./fhe-type";
import { computeInputHandle, computeMockCiphertext } from "./handle";
import type { CleartextConfig } from "./types";
import {
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
} from "../../token/errors";
import { normalizeHandle } from "../../utils";

const KMS_SIGNER = privateKeyToAccount(MOCK_KMS_SIGNER_PK as `0x${string}`);
const INPUT_SIGNER = privateKeyToAccount(MOCK_INPUT_SIGNER_PK);

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
]);

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

const STANDARD_EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

const USER_DECRYPT_TYPES = {
  EIP712Domain: STANDARD_EIP712_DOMAIN,
  UserDecryptRequestVerification: USER_DECRYPT_EIP712.types.UserDecryptRequestVerification,
} satisfies KmsUserDecryptEIP712Type["types"];
const DELEGATED_USER_DECRYPT_TYPES = {
  EIP712Domain: STANDARD_EIP712_DOMAIN,
  DelegatedUserDecryptRequestVerification:
    DELEGATED_USER_DECRYPT_EIP712.types.DelegatedUserDecryptRequestVerification,
} satisfies KmsDelegatedUserDecryptEIP712Type["types"];
const KMS_DECRYPTION_TYPES = {
  EIP712Domain: STANDARD_EIP712_DOMAIN,
  PublicDecryptVerification: KMS_DECRYPTION_EIP712.types.PublicDecryptVerification,
} satisfies KmsPublicDecryptEIP712Type["types"];

const FORBIDDEN_CHAIN_IDS = new Set([BigInt(mainnet.id), BigInt(sepolia.id)]);

// FheTypeId constants for hot-path comparisons
const EBOOL_ID: FheTypeId = 0;
const EADDRESS_ID: FheTypeId = 7;

function decodeClearValueType(handle: Handle, rawValue: bigint): ClearValueType {
  const typeByte = Number((BigInt(handle) >> 8n) & 0xffn);
  if (typeByte === EBOOL_ID) return rawValue !== 0n;
  if (typeByte === EADDRESS_ID) return toHex(rawValue, { size: 20 });
  return rawValue;
}

function normalizeEncryptValue(entry: EncryptParams["values"][number]): {
  fheType: FheTypeId;
  value: bigint;
} {
  if (!isFheTypeName(entry.type)) {
    throw new EncryptionFailedError(`Unsupported FHE type: ${entry.type}`);
  }

  const fheType = fheTypeIdFromName(entry.type);

  let value: bigint;
  if (entry.type === "ebool") {
    if (typeof entry.value === "boolean") {
      value = entry.value ? 1n : 0n;
    } else {
      value = entry.value;
      if (value !== 0n && value !== 1n) {
        throw new EncryptionFailedError("Bool value must be 0, 1, true, or false");
      }
    }
  } else if (entry.type === "eaddress") {
    value = BigInt(getAddress(entry.value));
  } else {
    value = entry.value;
  }

  if (value < 0n) {
    throw new EncryptionFailedError("Only non-negative cleartext values are supported");
  }

  const bits = encryptionBitsFromFheTypeId(fheType);
  const maxValue = (1n << BigInt(bits)) - 1n;
  if (value > maxValue) {
    throw new EncryptionFailedError(
      `Value ${value} exceeds max ${maxValue} for FheType ${fheType}`,
    );
  }

  return { fheType, value };
}

export class CleartextFhevmInstance implements RelayerSDK {
  readonly #client: PublicClient;
  readonly #config: CleartextConfig;
  readonly #chainIdBigInt: bigint;

  constructor(config: CleartextConfig) {
    this.#chainIdBigInt = BigInt(config.chainId);
    if (FORBIDDEN_CHAIN_IDS.has(this.#chainIdBigInt)) {
      throw new ConfigurationError(
        `Cleartext mode is not allowed on chain ${config.chainId}. ` +
          `It is intended for local development and testing only.`,
      );
    }
    this.#client = createPublicClient({
      transport: typeof config.network === "string" ? http(config.network) : custom(config.network),
    });
    this.#config = config;
  }

  async generateKeypair(): Promise<KeypairType<string>> {
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
    return {
      domain: USER_DECRYPT_EIP712.domain(
        this.#config.chainId,
        this.#config.verifyingContractAddressDecryption,
      ) as EIP712TypedData["domain"],
      types: USER_DECRYPT_TYPES,
      primaryType: "UserDecryptRequestVerification",
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
    const entries = params.values.map(normalizeEncryptValue);
    const contractAddress = getAddress(params.contractAddress);
    const userAddress = getAddress(params.userAddress);

    const mockCiphertexts = entries.map(({ fheType, value }) =>
      computeMockCiphertext(fheType, value, crypto.getRandomValues(new Uint8Array(32))),
    );

    const ciphertextBlob = keccak256(mockCiphertexts.length > 0 ? concat(mockCiphertexts) : "0x");

    const handles = entries.map(({ fheType }, index) =>
      computeInputHandle(
        ciphertextBlob,
        index,
        fheType,
        this.#config.aclContractAddress as Address,
        this.#chainIdBigInt,
      ),
    );

    const cleartextParts = entries.map(({ value }) => pad(toHex(value), { size: 32 }));
    const cleartextBytes: Hex = cleartextParts.length > 0 ? concat(cleartextParts) : "0x";

    const signature = await INPUT_SIGNER.signTypedData({
      domain: INPUT_VERIFICATION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.verifyingContractAddressInputVerification,
      ),
      types: {
        CiphertextVerification: INPUT_VERIFICATION_EIP712.types.CiphertextVerification,
      },
      primaryType: "CiphertextVerification",
      message: {
        ctHandles: handles,
        userAddress,
        contractAddress,
        contractChainId: this.#chainIdBigInt,
        extraData: cleartextBytes,
      },
    });

    const inputProof = toBytes(
      concat([
        toHex(new Uint8Array([handles.length])),
        toHex(new Uint8Array([1])),
        ...handles,
        signature,
        cleartextBytes,
      ]),
    );

    return {
      handles: handles.map((handle) => toBytes(handle)),
      inputProof,
    };
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    const normalizedHandles = params.handles.map(normalizeHandle);
    await this.#assertDecryptAuthorization(
      normalizedHandles,
      getAddress(params.signerAddress),
      getAddress(params.contractAddress),
      "User",
      "user decrypt",
    );

    return this.#decryptHandles(normalizedHandles);
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    const normalizedHandles = handles.map(normalizeHandle);

    const allowedResults = await Promise.all(
      normalizedHandles.map((handle) => this.#isAllowedForDecryption(handle)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new DecryptionFailedError(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not allowed for public decryption`,
      );
    }

    const orderedValues = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );
    const clearValues: PublicDecryptResult["clearValues"] = Object.fromEntries(
      normalizedHandles.map((handle, index) => [
        handle,
        decodeClearValueType(handle, orderedValues[index]!),
      ]),
    );

    const abiEncodedClearValues = concat(orderedValues.map((v) => pad(toHex(v), { size: 32 })));

    const signature = await KMS_SIGNER.signTypedData({
      domain: KMS_DECRYPTION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.verifyingContractAddressDecryption,
      ) as KmsPublicDecryptEIP712Type["domain"],
      types: KMS_DECRYPTION_TYPES,
      primaryType: "PublicDecryptVerification",
      message: {
        ctHandles: normalizedHandles,
        decryptedResult: abiEncodedClearValues,
        extraData: "0x",
      },
    });

    const decryptionProof = concat([toHex(new Uint8Array([1])), signature]);

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
    const message: KmsDelegatedUserDecryptEIP712Type["message"] = {
      publicKey: publicKey as KmsDelegatedUserDecryptEIP712Type["message"]["publicKey"],
      contractAddresses,
      delegatorAddress: getAddress(delegatorAddress),
      startTimestamp: String(startTimestamp),
      durationDays: String(durationDays),
      extraData: "0x00",
    };

    return {
      domain: DELEGATED_USER_DECRYPT_EIP712.domain(
        this.#chainIdBigInt,
        this.#config.verifyingContractAddressDecryption,
      ) as KmsDelegatedUserDecryptEIP712Type["domain"],
      types: DELEGATED_USER_DECRYPT_TYPES,
      primaryType: "DelegatedUserDecryptRequestVerification",
      message,
    };
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    const normalizedHandles = params.handles.map(normalizeHandle);
    await this.#assertDecryptAuthorization(
      normalizedHandles,
      getAddress(params.delegatorAddress),
      getAddress(params.contractAddress),
      "Delegator",
      "delegated decrypt",
    );

    return this.#decryptHandles(normalizedHandles);
  }

  async requestZKProofVerification(_zkProof: ZKProofLike): Promise<InputProofBytesType> {
    throw new ConfigurationError("Not implemented in cleartext mode");
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

  async #decryptHandles(
    normalizedHandles: Handle[],
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    const values = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );

    return Object.fromEntries(
      normalizedHandles.map((handle, index) => [
        handle,
        decodeClearValueType(handle, values[index]!),
      ]),
    );
  }

  async #assertDecryptAuthorization(
    normalizedHandles: Handle[],
    actorAddress: Address,
    contractAddress: Address,
    actorLabel: "User" | "Delegator",
    operationLabel: "user decrypt" | "delegated decrypt",
  ): Promise<void> {
    if (actorAddress === contractAddress) {
      throw new DecryptionFailedError(
        `${actorLabel} address ${actorAddress} must not equal contract address for ${operationLabel}`,
      );
    }

    const results = await Promise.all(
      normalizedHandles.flatMap((handle) => [
        this.#persistAllowed(handle, actorAddress),
        this.#persistAllowed(handle, contractAddress),
      ]),
    );

    for (let i = 0; i < normalizedHandles.length; i++) {
      const actorAllowed = results[i * 2];
      const contractAllowed = results[i * 2 + 1];
      if (!actorAllowed) {
        throw new DecryptionFailedError(
          `${actorLabel} ${actorAddress} is not authorized for ${operationLabel} of handle ${normalizedHandles[i]!}`,
        );
      }
      if (!contractAllowed) {
        throw new DecryptionFailedError(
          `Contract ${contractAddress} is not authorized for ${operationLabel} of handle ${normalizedHandles[i]!}`,
        );
      }
    }
  }

  async #persistAllowed(handle: Handle, account: Address): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.aclContractAddress as Address,
      abi: ACL_ABI,
      functionName: "persistAllowed",
      args: [handle, account],
    });
  }

  async #isAllowedForDecryption(handle: Handle): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.aclContractAddress as Address,
      abi: ACL_ABI,
      functionName: "isAllowedForDecryption",
      args: [handle],
    });
  }

  async #readPlaintext(handle: Handle): Promise<bigint> {
    return this.#client.readContract({
      address: this.#config.cleartextExecutorAddress as Address,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [handle],
    });
  }
}
