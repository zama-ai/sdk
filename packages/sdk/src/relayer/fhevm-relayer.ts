/**
 * `FhevmRelayer` — single-chain FHE backend that drives `@fhevm/sdk` directly on
 * the calling thread.
 *
 * Owns the `@fhevm/sdk` client lifecycle (runtime config + creation + WASM init,
 * lazily on first operation) and implements the
 * {@link RelayerSDK} domain interface by translating between zama-sdk's domain
 * shapes and the new SDK's API. Each public method maps onto the underlying
 * `@fhevm/sdk` call(s) it reflects — `encrypt` → `encryptValues`, `decryptPublicValues`
 * → `decryptPublicValuesWithSignatures`, `decryptValues` → `parseTransportKeyPair`
 * + `parseSignedDecryptionPermit` + `decryptValuesFromPairs`.
 *
 * Uses the `@fhevm/sdk/viem` adapter with a read-only viem public client built
 * from the chain's network URL (viem is a hard dependency; ethers is only an
 * optional peer). EIP-712 signing happens in the signer layer; this backend
 * builds the typed data and, on decrypt, reassembles the new SDK's signed permit
 * from the interface's params + the previously returned signature.
 *
 * The off-main-thread worker variant is a tracked follow-up.
 *
 * @see {@link toFhevmChain} for the chain projection.
 */
import { readKmsSignersContext } from "@fhevm/sdk/actions/base";
import {
  createKmsDelegatedUserDecryptEip712,
  createKmsUserDecryptEip712,
} from "@fhevm/sdk/actions/chain";
import { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import { createFhevmCleartextClient } from "@fhevm/sdk/viem/cleartext";
import type { Address, Hex } from "viem";
import { createPublicClient, custom, http } from "viem";
import { toFhevmChain } from "../chains/to-fhevm-chain";
import type { FheChain } from "../chains/types";
import type { TransportKeyPair } from "../credentials/types";
import type {
  ClearValue,
  DecryptPair,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptInput,
  EncryptParams,
  EncryptResult,
  EncryptedValue,
  FheEncryptionKey,
  FhevmClientOptions,
  FhevmRuntimeConfig,
  FhevmSdkClient,
  PublicDecryptResult,
  RelayerSDK,
  SerializedSignedPermit,
  SerializedTransportKeyPair,
  UserDecryptParams,
} from "./types";

/** Construction config for {@link FhevmRelayer}. */
export interface FhevmRelayerConfig {
  /** FHE chain configuration. */
  chain: FheChain;
  /**
   * Cleartext mode for local dev/test chains without FHE infrastructure — reads
   * mock cleartexts from the on-chain executor (discovered automatically)
   * instead of calling the relayer.
   */
  cleartext?: boolean;
  /** Per-client `@fhevm/sdk` options forwarded to `createFhevmClient`. */
  options?: FhevmClientOptions;
  /** Global `@fhevm/sdk` runtime config forwarded to `setFhevmRuntimeConfig`. */
  runtime?: FhevmRuntimeConfig;
}

/**
 * Map zama-sdk's FHE type names (`ebool`, `euint64`, `eaddress`) to the
 * Solidity-style names `@fhevm/sdk` expects (`bool`, `uint64`, `address`):
 * exactly "drop the leading `e`".
 */
function toSolidityType(type: EncryptInput["type"]): string {
  return type.slice(1);
}

/**
 * Single-chain FHE backend that drives `@fhevm/sdk` on the calling thread.
 * EIP-712 signing is done by the signer layer; this backend builds the typed
 * data and, on decrypt, reassembles the new SDK's signed permit from the
 * interface's params + the previously returned signature.
 */
export class FhevmRelayer implements RelayerSDK, Disposable {
  readonly #chain: FheChain;
  readonly #runtime: FhevmRuntimeConfig;
  readonly #fhevm: FhevmSdkClient;
  #initPromise: Promise<void> | null = null;

  constructor(config: FhevmRelayerConfig) {
    this.#chain = config.chain;
    this.#runtime = { moduleVersions: "auto", ...config.runtime };
    const params = {
      publicClient: createPublicClient({
        transport:
          typeof this.#chain.network === "string"
            ? http(this.#chain.network)
            : custom(this.#chain.network),
      }),
      chain: toFhevmChain(this.#chain),
      options: config.options,
    };
    this.#fhevm = config.cleartext ? createFhevmCleartextClient(params) : createFhevmClient(params);
  }

  /** Return the ACL contract address for the current chain. */
  getAclAddress(): Address {
    return this.#chain.aclContractAddress;
  }

  /**
   * Lazily run `#init` exactly once. Concurrency-safe: the in-flight promise is
   * cached and shared; a failed init clears the cache so a later call can retry.
   */
  #ensureInit(): Promise<void> {
    if (!this.#initPromise) {
      this.#initPromise = this.#init().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  /** Configure the `@fhevm/sdk` runtime (once per process) and build + init the client. */
  async #init(): Promise<void> {
    // Default load mode embeds WASM as base64 (no runtime fetch). Tracked
    // follow-up: switch to a hosted `locateFile` once CDN assets exist.
    // Per-chain `auth` is the default; an explicit `runtime.auth` overrides it.
    setFhevmRuntimeConfig({ auth: this.#chain.auth, ...this.#runtime });
    await this.#fhevm.init();
    await this.#fhevm.ready;
  }

  /** Generate a transport key pair, serialized to hex for the signer layer / storage. */
  async generateTransportKeyPair(): Promise<TransportKeyPair> {
    await this.#ensureInit();
    const transportKeyPair = await this.#fhevm.generateTransportKeyPair();
    return this.#fhevm.serializeTransportKeyPair({ transportKeyPair });
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays = 7,
  ): Promise<EIP712TypedData> {
    await this.#ensureInit();
    return this.#userDecryptEip712(publicKey, contractAddresses, startTimestamp, durationDays);
  }

  /** Encrypt typed plaintext inputs into encrypted values + a shared input proof. */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    await this.#ensureInit();
    const result = await this.#fhevm.encryptValues({
      values: params.values.map((v) => ({
        type: toSolidityType(v.type),
        value: v.value,
      })),
      contractAddress: params.contractAddress,
      userAddress: params.userAddress,
    });
    // `@fhevm/sdk` already returns hex strings (bytes32 encrypted values + the
    // input proof); they pass straight through. Do NOT re-`toHex` them — that would
    // UTF-8-encode the "0x…" string into a double-length blob and the on-chain
    // `fromExternal`/`verifyInput` would reject it.
    return {
      encryptedValues: result.encryptedValues.map((value) => value as Hex),
      inputProof: result.inputProof as Hex,
    };
  }

  async decryptValues(
    params: UserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    await this.#ensureInit();
    const eip712 = await this.#userDecryptEip712(
      params.publicKey,
      params.signedContractAddresses,
      params.startTimestamp,
      params.durationDays,
    );
    return this.#decryptValuesFromPairs({
      pairs: params.encryptedValues.map((encryptedValue) => ({
        encryptedValue,
        contractAddress: params.contractAddress,
      })),
      transportKeyPair: this.#serializeKeyPair(params.publicKey, params.privateKey),
      signedPermit: {
        eip712,
        signature: params.signature,
        signerAddress: params.signerAddress,
      } as unknown as SerializedSignedPermit,
    });
  }

  /** Public-decrypt encrypted values (no permit needed) with the KMS signature material. */
  async decryptPublicValues(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult> {
    await this.#ensureInit();
    const result = await this.#fhevm.decryptPublicValuesWithSignatures({
      encryptedValues,
    });
    const clearValues: Record<EncryptedValue, ClearValue> = {};
    result.checkSignaturesArgs.handlesList.forEach((encryptedValue: Hex, i: number) => {
      clearValues[encryptedValue] = result.clearValues[i]?.value as ClearValue;
    });
    return {
      clearValues,
      abiEncodedClearValues: result.checkSignaturesArgs.abiEncodedCleartexts,
      decryptionProof: result.checkSignaturesArgs.decryptionProof,
    };
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays = 7,
  ): Promise<EIP712TypedData> {
    await this.#ensureInit();
    return this.#delegatedUserDecryptEip712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedDecryptValues(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    await this.#ensureInit();
    const eip712 = await this.#delegatedUserDecryptEip712(
      params.publicKey,
      params.signedContractAddresses,
      params.delegatorAddress,
      params.startTimestamp,
      params.durationDays,
    );
    return this.#decryptValuesFromPairs({
      pairs: params.encryptedValues.map((encryptedValue) => ({
        encryptedValue,
        contractAddress: params.contractAddress,
      })),
      transportKeyPair: this.#serializeKeyPair(params.publicKey, params.privateKey),
      signedPermit: {
        eip712,
        signature: params.signature,
        signerAddress: params.delegateAddress,
      } as unknown as SerializedSignedPermit,
    });
  }

  /** Fetch the network's FHE encryption key, mapped to zama-sdk's shape. */
  async fetchFheEncryptionKeyBytes(): Promise<FheEncryptionKey | null> {
    await this.#ensureInit();
    const result = await this.#fhevm.fetchFheEncryptionKeyBytes();
    return {
      publicKeyId: result.publicKeyBytes.id,
      publicKey: result.publicKeyBytes.bytes as Uint8Array,
    };
  }

  /**
   * Decrypt encrypted-value/contract pairs: parse the serialized transport key pair
   * and signed permit (built + signed in the signer layer), then decrypt and map
   * back to an `encrypted value → clear value` record. Delegated decryption uses the same
   * path — the delegation is encoded in the permit.
   */
  async #decryptValuesFromPairs(params: {
    pairs: readonly DecryptPair[];
    transportKeyPair: SerializedTransportKeyPair;
    signedPermit: SerializedSignedPermit;
  }): Promise<Record<EncryptedValue, ClearValue>> {
    const transportKeyPair = await this.#fhevm.parseTransportKeyPair(params.transportKeyPair);
    const signedPermit = await this.#fhevm.parseSignedDecryptionPermit({
      serializedPermit: params.signedPermit,
      transportKeyPair,
    });
    const typed = await this.#fhevm.decryptValuesFromPairs({
      pairs: params.pairs,
      transportKeyPair,
      signedPermit,
    });
    const out: Record<EncryptedValue, ClearValue> = {};
    params.pairs.forEach((pair, i) => {
      out[pair.encryptedValue] = typed[i]?.value as ClearValue;
    });
    return out;
  }

  /**
   * `extraData` binding the permit to the current on-chain KMS signers context.
   *
   * The KMS verifier embeds its active context (`0x01` + 32-byte context id, or
   * `0x00` when unset) in every decryption result and rejects permits whose
   * `extraData` doesn't match. We read the live context so the EIP-712 the user
   * signs carries the same bytes the verifier will check. The read is TTL-cached
   * inside `@fhevm/sdk`, so repeated decrypts don't re-hit the chain.
   */
  async #currentKmsExtraData(): Promise<Hex> {
    const context = await readKmsSignersContext(this.#fhevm);
    if (context.id === 0n) {
      return "0x00";
    }
    return `0x01${context.id.toString(16).padStart(64, "0")}`;
  }

  /** Build EIP-712 typed data for a (self) user-decrypt permit. */
  async #userDecryptEip712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number,
  ) {
    return createKmsUserDecryptEip712(this.#fhevm, {
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
      extraData: await this.#currentKmsExtraData(),
    });
  }

  /** Build EIP-712 typed data for a delegated user-decrypt permit. */
  async #delegatedUserDecryptEip712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays: number,
  ) {
    return createKmsDelegatedUserDecryptEip712(this.#fhevm, {
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
      extraData: await this.#currentKmsExtraData(),
    });
  }

  #serializeKeyPair(publicKey: Hex, privateKey: Hex): SerializedTransportKeyPair {
    return { publicKey, privateKey } as unknown as SerializedTransportKeyPair;
  }

  terminate(): void {
    this.#initPromise = null;
  }

  [Symbol.dispose](): void {
    this.terminate();
  }
}
