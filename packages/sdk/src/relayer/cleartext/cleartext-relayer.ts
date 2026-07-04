import type { TypedValue } from "@fhevm/sdk/types";
import { createFhevmCleartextClient } from "@fhevm/sdk/viem/cleartext";
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
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { toFhevmChain } from "../../chains/to-fhevm-chain";
import type { FheChain } from "../../chains/types";
import {
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
  NotEntitledError,
} from "../../errors";
import type { FhevmClient, FhevmClientOptions, FhevmRelayerSDK } from "../types";
import { MOCK_INPUT_SIGNER_PK, MOCK_KMS_SIGNER_PK } from "./constants";
import { INPUT_VERIFICATION_EIP712, KMS_DECRYPTION_EIP712 } from "./eip712";
import {
  encryptionBitsFromFheTypeId,
  fheTypeIdFromValueTypeName,
  valueTypeNameFromFheTypeId,
  type FheTypeId,
} from "./fhe-type";
import { computeInputHandle, computeMockCiphertext } from "./handle";

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
]);

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

const FORBIDDEN_CHAIN_IDS = new Set<number>([mainnet.id, sepolia.id]);

// The mock emits plain hex; the `@fhevm/sdk` interface uses branded value types
// (`EncryptedValue`, `HandleBytes32Hex`, `BytesHex`). These aliases localize the
// unavoidable `as unknown as` casts at the interface boundary.
type EncryptValueReturn = Awaited<ReturnType<FhevmClient["encryptValue"]>>;
type EncryptValuesReturn = Awaited<ReturnType<FhevmClient["encryptValues"]>>;
type DecryptPublicWithSignaturesReturn = Awaited<
  ReturnType<FhevmClient["decryptPublicValuesWithSignatures"]>
>;

/** Coerce any `EncryptedValueLike` down to a 0x bytes32 handle string. */
function toHandleHex(value: unknown): Hex {
  if (typeof value === "string") return value as Hex;
  if (value instanceof Uint8Array) return toHex(value);
  if (value && typeof value === "object" && "bytes32Hex" in value) {
    return (value as { bytes32Hex: string }).bytes32Hex as Hex;
  }
  throw new DecryptionFailedError(`Unsupported encrypted value: ${String(value)}`);
}

/**
 * Cleartext FHE backend — a fully off-chain mock that satisfies the new
 * {@link FhevmRelayerSDK} interface without any FHE infrastructure or the
 * `@fhevm/sdk` on-chain cleartext (`Cleartext*` host) contract set.
 *
 * Reads mock plaintexts straight from the executor's `plaintexts` mapping
 * (deployed by the `forge-fhevm` Foundry library) and enforces ACL in
 * TypeScript, so the KMS-verifier round-trip is bypassed entirely. The opaque,
 * branded credential types (`TransportKeyPair`, `SignedDecryptionPermit`) — which
 * can only be minted by `@fhevm/sdk` — are delegated to an internal cleartext
 * client; every plaintext- or KMS-touching method is overridden here.
 */
export class CleartextRelayer implements FhevmRelayerSDK {
  readonly #chain: FheChain;
  readonly #client: PublicClient;
  readonly #inner: FhevmClient;
  readonly #kmsSigner: PrivateKeyAccount;
  readonly #inputSigner: PrivateKeyAccount;

  constructor(chain: FheChain, options?: FhevmClientOptions) {
    if (FORBIDDEN_CHAIN_IDS.has(chain.id)) {
      throw new ConfigurationError(
        `Cleartext mode is not allowed on chain ${chain.id}. ` +
          `It is intended for local development and testing only.`,
      );
    }
    if (!chain.executorAddress) {
      throw new ConfigurationError(
        `Cleartext relayer requires an executorAddress for chain ${chain.id}.`,
      );
    }
    this.#chain = chain;
    this.#client = createPublicClient({
      transport:
        typeof chain.network === "string" ? http(chain.network) : custom(chain.network),
    });
    this.#inner = createFhevmCleartextClient({
      publicClient: this.#client,
      chain: toFhevmChain(chain),
      options,
    });
    this.#kmsSigner = privateKeyToAccount(MOCK_KMS_SIGNER_PK);
    this.#inputSigner = privateKeyToAccount(MOCK_INPUT_SIGNER_PK);
  }

  get chain() {
    return this.#chain;
  }

  // ── Delegated: opaque branded-type plumbing only `@fhevm/sdk` can construct ──
  // These never read plaintexts or hit the KMS verifier; they build/round-trip
  // the transport key pair and signed permit (WASM tkms + local signer only).

  generateTransportKeyPair: FhevmClient["generateTransportKeyPair"] = async () => {
    await this.#inner.init();
    return this.#inner.generateTransportKeyPair();
  };

  serializeTransportKeyPair: FhevmClient["serializeTransportKeyPair"] = (parameters) =>
    this.#inner.serializeTransportKeyPair(parameters);

  parseTransportKeyPair: FhevmClient["parseTransportKeyPair"] = (parameters) =>
    this.#inner.parseTransportKeyPair(parameters);

  signDecryptionPermit: FhevmClient["signDecryptionPermit"] = async (parameters) => {
    await this.#inner.init();
    return this.#inner.signDecryptionPermit(parameters);
  };

  serializeSignedDecryptionPermit: FhevmClient["serializeSignedDecryptionPermit"] = (parameters) =>
    this.#inner.serializeSignedDecryptionPermit(parameters);

  // Non-network passthrough — mirrors `FhevmRelayer`, which treats permit
  // parsing as offline (no relayer round-trip, no `init`).
  parseSignedDecryptionPermit: FhevmClient["parseSignedDecryptionPermit"] = (parameters) =>
    this.#inner.parseSignedDecryptionPermit(parameters);

  fetchFheEncryptionKeyBytes: FhevmClient["fetchFheEncryptionKeyBytes"] = async (parameters) => {
    await this.#inner.init();
    return this.#inner.fetchFheEncryptionKeyBytes(parameters);
  };

  // ── Overridden: off-chain mock (bypasses relayer + KMS verifier) ──

  encryptValue: FhevmClient["encryptValue"] = async (parameters) => {
    const { encryptedValues, inputProof } = await this.#encrypt(
      [parameters.value],
      parameters.contractAddress,
      parameters.userAddress,
    );
    return { encryptedValue: encryptedValues[0]!, inputProof } as unknown as EncryptValueReturn;
  };

  encryptValues: FhevmClient["encryptValues"] = async (parameters) => {
    const result = await this.#encrypt(
      parameters.values,
      parameters.contractAddress,
      parameters.userAddress,
    );
    return result as unknown as EncryptValuesReturn;
  };

  decryptValue: FhevmClient["decryptValue"] = async (parameters) => {
    const handle = toHandleHex(parameters.encryptedValue);
    await this.#assertUserDecryptAuth([handle], parameters.signedPermit, getAddress(parameters.contractAddress));
    return this.#readTypedValue(handle);
  };

  decryptValues: FhevmClient["decryptValues"] = async (parameters) => {
    const handles = parameters.encryptedValues.map(toHandleHex);
    await this.#assertUserDecryptAuth(handles, parameters.signedPermit, getAddress(parameters.contractAddress));
    return Promise.all(handles.map((h) => this.#readTypedValue(h)));
  };

  decryptValuesFromPairs: FhevmClient["decryptValuesFromPairs"] = async (parameters) => {
    const pairs = parameters.pairs.map((p) => ({
      handle: toHandleHex(p.encryptedValue),
      contractAddress: getAddress(p.contractAddress),
    }));
    // Authorize per contract, then read positionally.
    for (const pair of pairs) {
      await this.#assertUserDecryptAuth([pair.handle], parameters.signedPermit, pair.contractAddress);
    }
    return Promise.all(pairs.map((p) => this.#readTypedValue(p.handle)));
  };

  decryptPublicValue: FhevmClient["decryptPublicValue"] = async (parameters) => {
    const handle = toHandleHex(parameters.encryptedValue);
    await this.#assertPublicDecryptAllowed([handle]);
    return this.#readTypedValue(handle);
  };

  decryptPublicValues: FhevmClient["decryptPublicValues"] = async (parameters) => {
    const handles = parameters.encryptedValues.map(toHandleHex);
    await this.#assertPublicDecryptAllowed(handles);
    return Promise.all(handles.map((h) => this.#readTypedValue(h)));
  };

  decryptPublicValuesWithSignatures: FhevmClient["decryptPublicValuesWithSignatures"] = async (
    parameters,
  ) => {
    const handles = parameters.encryptedValues.map(toHandleHex);
    await this.#assertPublicDecryptAllowed(handles);

    const rawValues = await Promise.all(handles.map((h) => this.#readPlaintext(h)));
    const abiEncodedCleartexts = concat(rawValues.map((v) => pad(toHex(v), { size: 32 })));

    const signature = await this.#kmsSigner.signTypedData({
      domain: KMS_DECRYPTION_EIP712.domain(
        this.#chain.gatewayChainId,
        this.#chain.verifyingContractAddressDecryption,
      ),
      types: { PublicDecryptVerification: KMS_DECRYPTION_EIP712.types.PublicDecryptVerification },
      primaryType: "PublicDecryptVerification",
      message: { ctHandles: handles, decryptedResult: abiEncodedCleartexts, extraData: "0x" },
    });
    const decryptionProof = concat([toHex(new Uint8Array([1])), signature]);

    const clearValues = handles.map((h, i) => this.#decodeTypedValue(h, rawValues[i]!));

    return {
      clearValues,
      checkSignaturesArgs: { handlesList: handles, abiEncodedCleartexts, decryptionProof },
    } as unknown as DecryptPublicWithSignaturesReturn;
  };

  // ── Internals ──

  async #encrypt(
    values: readonly { readonly type: string; readonly value: unknown }[],
    contractAddressRaw: string,
    userAddressRaw: string,
  ): Promise<{ encryptedValues: Hex[]; inputProof: Hex }> {
    const entries = values.map((v) => this.#normalizeEncryptValue(v));
    const contractAddress = getAddress(contractAddressRaw);
    const userAddress = getAddress(userAddressRaw);

    const mockCiphertexts = entries.map(({ fheType, value }) =>
      computeMockCiphertext(fheType, value, crypto.getRandomValues(new Uint8Array(32))),
    );
    const ciphertextBlob = keccak256(mockCiphertexts.length > 0 ? concat(mockCiphertexts) : "0x");

    const handles = entries.map(({ fheType }, index) =>
      computeInputHandle(
        ciphertextBlob,
        index,
        fheType,
        this.#chain.aclContractAddress,
        BigInt(this.#chain.id),
      ),
    );

    const cleartextParts = entries.map(({ value }) => pad(toHex(value), { size: 32 }));
    const cleartextBytes: Hex = cleartextParts.length > 0 ? concat(cleartextParts) : "0x";

    const signature = await this.#inputSigner.signTypedData({
      domain: INPUT_VERIFICATION_EIP712.domain(
        this.#chain.gatewayChainId,
        this.#chain.verifyingContractAddressInputVerification,
      ),
      types: { CiphertextVerification: INPUT_VERIFICATION_EIP712.types.CiphertextVerification },
      primaryType: "CiphertextVerification",
      message: {
        ctHandles: handles,
        userAddress,
        contractAddress,
        contractChainId: BigInt(this.#chain.id),
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

  #normalizeEncryptValue(entry: { readonly type: string; readonly value: unknown }): {
    fheType: FheTypeId;
    value: bigint;
  } {
    const fheType = fheTypeIdFromValueTypeName(entry.type);

    let value: bigint;
    if (entry.type === "bool") {
      const v = entry.value;
      if (v === true || v === 1n || v === 1 || v === "1") value = 1n;
      else if (v === false || v === 0n || v === 0 || v === "0") value = 0n;
      else throw new EncryptionFailedError("Bool value must be 0, 1, true, or false");
    } else if (entry.type === "address") {
      value = BigInt(getAddress(String(entry.value)));
    } else {
      value = BigInt(entry.value as bigint | number | string);
    }

    if (value < 0n) {
      throw new EncryptionFailedError("Only non-negative cleartext values are supported");
    }
    const bits = encryptionBitsFromFheTypeId(fheType);
    const maxValue = (1n << BigInt(bits)) - 1n;
    if (value > maxValue) {
      throw new EncryptionFailedError(`Value ${value} exceeds max ${maxValue} for FheType ${fheType}`);
    }

    return { fheType, value };
  }

  async #assertUserDecryptAuth(
    handles: Hex[],
    signedPermit: { readonly encryptedDataOwnerAddress: string; readonly signerAddress: string; readonly isDelegated: boolean },
    contractAddress: Address,
  ): Promise<void> {
    const owner = getAddress(signedPermit.encryptedDataOwnerAddress);

    if (signedPermit.isDelegated) {
      const delegate = getAddress(signedPermit.signerAddress);
      const delegated = await Promise.all(
        handles.map((h) => this.#isHandleDelegated(owner, delegate, contractAddress, h)),
      );
      const ownerAllowed = await Promise.all(handles.map((h) => this.#persistAllowed(h, owner)));
      for (let i = 0; i < handles.length; i++) {
        if (!delegated[i]) {
          throw new DecryptionFailedError(
            `Encrypted value ${handles[i]!} is not delegated for user decryption`,
          );
        }
        // Local ACL is authoritative here (no gateway/propagation lag), so a
        // failed grant is terminal — map to NotEntitledError, not the retryable
        // DelegationNotPropagatedError.
        if (!ownerAllowed[i]) {
          throw new NotEntitledError({ encryptedValue: handles[i]!, contractAddress, account: owner });
        }
      }
      return;
    }

    if (owner === contractAddress) {
      throw new DecryptionFailedError(
        `Owner address ${owner} must not equal contract address for user decrypt`,
      );
    }
    const results = await Promise.all(
      handles.flatMap((h) => [this.#persistAllowed(h, owner), this.#persistAllowed(h, contractAddress)]),
    );
    for (let i = 0; i < handles.length; i++) {
      if (!results[i * 2]) {
        throw new NotEntitledError({ encryptedValue: handles[i]!, contractAddress, account: owner });
      }
      if (!results[i * 2 + 1]) {
        throw new DecryptionFailedError(
          `Contract ${contractAddress} is not authorized for user decrypt of ${handles[i]!}`,
        );
      }
    }
  }

  async #assertPublicDecryptAllowed(handles: Hex[]): Promise<void> {
    const allowed = await Promise.all(handles.map((h) => this.#isAllowedForDecryption(h)));
    const bad = allowed.findIndex((a) => !a);
    if (bad !== -1) {
      throw new DecryptionFailedError(
        `Encrypted value ${handles[bad]!} is not allowed for public decryption`,
      );
    }
  }

  async #readTypedValue(handle: Hex): Promise<TypedValue> {
    return this.#decodeTypedValue(handle, await this.#readPlaintext(handle));
  }

  #decodeTypedValue(handle: Hex, rawValue: bigint): TypedValue {
    const typeName = valueTypeNameFromFheTypeId(Number((BigInt(handle) >> 8n) & 0xffn));
    let value: boolean | bigint | Address;
    if (typeName === "bool") value = rawValue !== 0n;
    else if (typeName === "address") value = getAddress(toHex(rawValue, { size: 20 }));
    else value = rawValue;
    return { type: typeName, value } as unknown as TypedValue;
  }

  #readPlaintext(handle: Hex): Promise<bigint> {
    return this.#client.readContract({
      address: this.#chain.executorAddress as Address,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [handle],
    });
  }

  #persistAllowed(handle: Hex, account: Address): Promise<boolean> {
    return this.#client.readContract({
      address: this.#chain.aclContractAddress,
      abi: ACL_ABI,
      functionName: "persistAllowed",
      args: [handle, account],
    });
  }

  #isAllowedForDecryption(handle: Hex): Promise<boolean> {
    return this.#client.readContract({
      address: this.#chain.aclContractAddress,
      abi: ACL_ABI,
      functionName: "isAllowedForDecryption",
      args: [handle],
    });
  }

  #isHandleDelegated(
    delegator: Address,
    delegate: Address,
    contractAddress: Address,
    handle: Hex,
  ): Promise<boolean> {
    return this.#client.readContract({
      address: this.#chain.aclContractAddress,
      abi: ACL_ABI,
      functionName: "isHandleDelegatedForUserDecryption",
      args: [delegator, delegate, contractAddress, handle],
    });
  }
}
