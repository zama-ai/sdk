import type { PrivateKeyAccount } from "viem/accounts";
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
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  KmsPublicDecryptEIP712Type,
  KmsUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";

import type { RelayerSDK } from "../relayer-sdk";
import type {
  ClearValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  EncryptedValue,
  PublicDecryptResult,
  PublicKeyData,
  PublicParamsData,
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
import type { FheChain } from "../../chains/types";
import { ConfigurationError, DecryptionFailedError, EncryptionFailedError } from "../../errors";

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
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

const FORBIDDEN_CHAIN_IDS = new Set<number>([mainnet.id, sepolia.id]);

// FheTypeId constants for hot-path comparisons
const EBOOL_ID: FheTypeId = 0;
const EADDRESS_ID: FheTypeId = 7;

function decodeClearValue(encryptedValue: EncryptedValue, rawValue: bigint): ClearValue {
  const typeByte = Number((BigInt(encryptedValue) >> 8n) & 0xffn);
  if (typeByte === EBOOL_ID) {
    return rawValue !== 0n;
  }
  if (typeByte === EADDRESS_ID) {
    return toHex(rawValue, { size: 20 });
  }
  return rawValue;
}

function normalizeEncryptValue(entry: EncryptParams["values"][number]): {
  fheType: FheTypeId;
  value: bigint;
} {
  if (!isFheTypeName(entry.type)) {
    throw new EncryptionFailedError("Unsupported FHE type");
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

export class RelayerCleartext implements RelayerSDK, Disposable {
  readonly #client: PublicClient;
  readonly #config: FheChain;
  readonly kmsSigner: PrivateKeyAccount;
  readonly inputSigner: PrivateKeyAccount;

  constructor(config: FheChain) {
    if (FORBIDDEN_CHAIN_IDS.has(config.id)) {
      throw new ConfigurationError(
        `Cleartext mode is not allowed on chain ${config.id}. ` +
          `It is intended for local development and testing only.`,
      );
    }
    if (!config.executorAddress) {
      throw new ConfigurationError(
        `Cleartext transport requires an executorAddress for chain ${config.id}.`,
      );
    }
    this.#client = createPublicClient({
      transport: typeof config.network === "string" ? http(config.network) : custom(config.network),
    });
    this.#config = config;
    this.kmsSigner = privateKeyToAccount(config.kmsSignerPrivateKey ?? MOCK_KMS_SIGNER_PK);
    this.inputSigner = privateKeyToAccount(config.inputSignerPrivateKey ?? MOCK_INPUT_SIGNER_PK);
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    const publicKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
    let privateKey = toHex(crypto.getRandomValues(new Uint8Array(32)));

    while (privateKey === publicKey) {
      privateKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
    }

    return { publicKey, privateKey };
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays = 7,
  ): Promise<EIP712TypedData> {
    return {
      domain: USER_DECRYPT_EIP712.domain(
        this.#config.id,
        this.#config.verifyingContractAddressDecryption as Address,
      ),
      types: USER_DECRYPT_TYPES,
      primaryType: "UserDecryptRequestVerification",
      message: {
        publicKey,
        contractAddresses,
        startTimestamp: String(startTimestamp),
        durationDays: String(durationDays),
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
        BigInt(this.#config.id),
      ),
    );

    const cleartextParts = entries.map(({ value }) => pad(toHex(value), { size: 32 }));
    const cleartextBytes: Hex = cleartextParts.length > 0 ? concat(cleartextParts) : "0x";

    const signature = await this.inputSigner.signTypedData({
      domain: INPUT_VERIFICATION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.verifyingContractAddressInputVerification as Address,
      ),
      types: {
        CiphertextVerification: INPUT_VERIFICATION_EIP712.types.CiphertextVerification,
      },
      primaryType: "CiphertextVerification",
      message: {
        ctHandles: handles,
        userAddress,
        contractAddress,
        contractChainId: BigInt(this.#config.id),
        extraData: cleartextBytes,
      },
    });

    const inputProof = concat([
      toHex(new Uint8Array([handles.length])),
      toHex(new Uint8Array([1])),
      ...handles,
      signature,
      cleartextBytes,
    ]);

    return { encryptedValues: handles, inputProof };
  }

  async userDecrypt(
    params: UserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    await this.#assertDecryptAuthorization(
      params.encryptedValues,
      getAddress(params.signerAddress),
      getAddress(params.contractAddress),
      "User",
      "user decrypt",
    );

    return this.#decryptHandles(params.encryptedValues);
  }

  async publicDecrypt(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult> {
    const normalizedHandles = encryptedValues;

    const allowedResults = await Promise.all(
      normalizedHandles.map((encryptedValue) => this.#isAllowedForDecryption(encryptedValue)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new DecryptionFailedError(
        `Encrypted value ${normalizedHandles[unauthorizedIndex]!} is not allowed for public decryption`,
      );
    }

    const orderedValues = await Promise.all(
      normalizedHandles.map((encryptedValue) => this.#readPlaintext(encryptedValue)),
    );
    const clearValues: PublicDecryptResult["clearValues"] = Object.fromEntries(
      normalizedHandles.map((encryptedValue, index) => [
        encryptedValue,
        decodeClearValue(encryptedValue, orderedValues[index]!),
      ]),
    );

    const abiEncodedClearValues = concat(orderedValues.map((v) => pad(toHex(v), { size: 32 })));

    const signature = await this.kmsSigner.signTypedData({
      domain: KMS_DECRYPTION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.verifyingContractAddressDecryption as Address,
      ),
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
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const message: KmsDelegatedUserDecryptEIP712Type["message"] = {
      publicKey,
      contractAddresses,
      delegatorAddress: getAddress(delegatorAddress),
      startTimestamp: String(startTimestamp),
      durationDays: String(durationDays),
      extraData: "0x00",
    };

    return {
      domain: DELEGATED_USER_DECRYPT_EIP712.domain(
        this.#config.id,
        this.#config.verifyingContractAddressDecryption as Address,
      ),
      types: DELEGATED_USER_DECRYPT_TYPES,
      primaryType: "DelegatedUserDecryptRequestVerification",
      message,
    };
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    await this.#assertDelegation(
      params.encryptedValues,
      getAddress(params.delegatorAddress),
      getAddress(params.delegateAddress),
      getAddress(params.contractAddress),
    );

    return this.#decryptHandles(params.encryptedValues);
  }

  async requestZKProofVerification(_zkProof: ZKProofLike): Promise<InputProofBytesType> {
    throw new ConfigurationError("Not implemented in cleartext mode");
  }

  async getPublicKey(): Promise<PublicKeyData | null> {
    return {
      publicKeyId: "mock-public-key-id",
      publicKey: new Uint8Array([32]),
    };
  }

  async getPublicParams(_bits: number): Promise<PublicParamsData | null> {
    return {
      publicParams: new Uint8Array([32]),
      publicParamsId: "mock-public-params-id",
    };
  }

  async getAclAddress(): Promise<Address> {
    return this.#config.aclContractAddress as Address;
  }

  terminate(): void {
    // No resources to release in cleartext mode.
  }

  /** Calls {@link terminate} (no-op in cleartext mode). */
  [Symbol.dispose](): void {
    this.terminate();
  }

  async #decryptHandles(
    normalizedEncryptedValues: EncryptedValue[],
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    const values = await Promise.all(
      normalizedEncryptedValues.map((encryptedValue) => this.#readPlaintext(encryptedValue)),
    );

    return Object.fromEntries(
      normalizedEncryptedValues.map((encryptedValue, index) => [
        encryptedValue,
        decodeClearValue(encryptedValue, values[index]!),
      ]),
    );
  }

  async #assertDecryptAuthorization(
    normalizedEncryptedValues: EncryptedValue[],
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
      normalizedEncryptedValues.flatMap((encryptedValue) => [
        this.#persistAllowed(encryptedValue, actorAddress),
        this.#persistAllowed(encryptedValue, contractAddress),
      ]),
    );

    for (let i = 0; i < normalizedEncryptedValues.length; i++) {
      const actorAllowed = results[i * 2];
      const contractAllowed = results[i * 2 + 1];
      if (!actorAllowed) {
        throw new DecryptionFailedError(
          `${actorLabel} ${actorAddress} is not authorized for ${operationLabel} of encrypted value ${normalizedEncryptedValues[i]!}`,
        );
      }
      if (!contractAllowed) {
        throw new DecryptionFailedError(
          `Contract ${contractAddress} is not authorized for ${operationLabel} of encrypted value ${normalizedEncryptedValues[i]!}`,
        );
      }
    }
  }

  async #assertDelegation(
    encryptedValues: EncryptedValue[],
    delegatorAddress: Address,
    delegateAddress: Address,
    contractAddress: Address,
  ): Promise<void> {
    const results = await Promise.all(
      encryptedValues.map((encryptedValue) =>
        this.#client.readContract({
          address: this.#config.aclContractAddress as Address,
          abi: ACL_ABI,
          functionName: "isHandleDelegatedForUserDecryption",
          args: [delegatorAddress, delegateAddress, contractAddress, encryptedValue],
        }),
      ),
    );

    for (let i = 0; i < encryptedValues.length; i++) {
      if (!results[i]) {
        throw new DecryptionFailedError(
          `Encrypted value ${encryptedValues[i]!} is not delegated for user decryption`,
        );
      }
    }
  }

  async #persistAllowed(encryptedValue: EncryptedValue, account: Address): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.aclContractAddress as Address,
      abi: ACL_ABI,
      functionName: "persistAllowed",
      args: [encryptedValue, account],
    });
  }

  async #isAllowedForDecryption(encryptedValue: EncryptedValue): Promise<boolean> {
    return this.#client.readContract({
      address: this.#config.aclContractAddress as Address,
      abi: ACL_ABI,
      functionName: "isAllowedForDecryption",
      args: [encryptedValue],
    });
  }

  async #readPlaintext(encryptedValue: EncryptedValue): Promise<bigint> {
    return this.#client.readContract({
      address: this.#config.executorAddress as Address,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [encryptedValue],
    });
  }
}
