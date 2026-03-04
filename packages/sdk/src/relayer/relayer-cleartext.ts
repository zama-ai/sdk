import { createCleartextInstance } from "../cleartext/cleartext-instance";
import type { RelayerSDK } from "./relayer-sdk";
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
} from "./relayer-sdk.types";
import {
  buildEIP712DomainType,
  CleartextInstanceConfig,
  convertToBigIntRecord,
  DefaultConfigs,
} from "./relayer-utils";

type CleartextInstance = Awaited<ReturnType<typeof createCleartextInstance>>;

export interface RelayerCleartextConfig {
  /** Per-chain cleartext transport configs, keyed by chain ID. */
  transports: Record<number, Partial<CleartextInstanceConfig>>;
  /** Resolve the current chain ID. Called lazily before each operation. */
  getChainId: () => Promise<number>;
}

/**
 * RelayerCleartext — cleartext encryption/decryption layer for development and testing.
 * No WASM, no workers. Reads plaintext values from a CleartextFHEVMExecutor contract.
 *
 * Uses the same lazy-init + chain-switch pattern as {@link RelayerNode} and {@link RelayerWeb}.
 */
export class RelayerCleartext implements RelayerSDK {
  readonly #config: RelayerCleartextConfig;
  #initPromise: Promise<CleartextInstance> | null = null;
  #ensureLock: Promise<CleartextInstance> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;

  constructor(config: RelayerCleartextConfig) {
    this.#config = config;
  }

  async #ensureInstance(): Promise<CleartextInstance> {
    if (this.#ensureLock) return this.#ensureLock;
    this.#ensureLock = this.#ensureInstanceInner().finally(() => {
      this.#ensureLock = null;
    });
    return this.#ensureLock;
  }

  async #ensureInstanceInner(): Promise<CleartextInstance> {
    // Auto-restart after terminate() — supports React StrictMode's
    // unmount→remount cycle and HMR without permanently killing the instance.
    if (this.#terminated) {
      this.#terminated = false;
      this.#initPromise = null;
      this.#resolvedChainId = null;
    }

    const chainId = await this.#config.getChainId();

    // Chain changed → discard old instance, re-init
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#initPromise = null;
    }

    this.#resolvedChainId = chainId;

    if (!this.#initPromise) {
      this.#initPromise = this.#initInstance(chainId).catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  async #initInstance(chainId: number): Promise<CleartextInstance> {
    const overrides = this.#config.transports[chainId];
    if (!overrides) {
      throw new Error(`No cleartext transport config for chainId: ${chainId}`);
    }

    const base = DefaultConfigs[chainId];
    const config = { ...base, ...overrides } as CleartextInstanceConfig;
    if (!config.network || !config.cleartextExecutorAddress) {
      throw new Error(`Incomplete cleartext config for chainId: ${chainId}`);
    }

    const instance = await createCleartextInstance(config);

    if (this.#terminated) {
      throw new Error("RelayerCleartext was terminated during initialization");
    }

    return instance;
  }

  terminate(): void {
    this.#terminated = true;
    this.#initPromise = null;
    this.#ensureLock = null;
  }

  async generateKeypair(): Promise<FHEKeypair> {
    const instance = await this.#ensureInstance();
    const result = instance.generateKeypair();
    return { publicKey: result.publicKey, privateKey: result.privateKey };
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const instance = await this.#ensureInstance();
    const result = instance.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );

    const domain = {
      name: result.domain.name as string,
      version: result.domain.version as string,
      chainId: Number(result.domain.chainId),
      verifyingContract: result.domain.verifyingContract as Address,
    };

    return {
      domain,
      types: {
        EIP712Domain: buildEIP712DomainType(domain),
        UserDecryptRequestVerification: [...result.types.UserDecryptRequestVerification],
      },
      message: {
        publicKey: String(result.message.publicKey),
        contractAddresses: [...result.message.contractAddresses] as string[],
        startTimestamp: BigInt(result.message.startTimestamp),
        durationDays: BigInt(result.message.durationDays),
        extraData: String(result.message.extraData),
      },
    };
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const instance = await this.#ensureInstance();
    const input = instance.createEncryptedInput(params.contractAddress, params.userAddress);
    // TODO: support all FHE types (addBool, add8, add16, add32, add128, add256, addAddress)
    // Currently defaults to add64 — callers needing other types should use
    // createCleartextInstance() and the low-level add* methods directly.
    for (const value of params.values) {
      try {
        input.add64(value);
      } catch {
        throw new Error(
          `RelayerCleartext.encrypt() only supports values up to uint64 (2^64 - 1). ` +
            `For larger types (uint128, uint256, address), use createCleartextInstance() and the low-level add* methods.`,
        );
      }
    }
    const encrypted = await input.encrypt();
    return { handles: encrypted.handles, inputProof: encrypted.inputProof };
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    const instance = await this.#ensureInstance();
    const handleContractPairs = params.handles.map((handle) => ({
      handle,
      contractAddress: params.contractAddress,
    }));
    const result = await instance.userDecrypt(
      handleContractPairs,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.signedContractAddresses,
      params.signerAddress,
      params.startTimestamp,
      params.durationDays,
    );
    return convertToBigIntRecord(result);
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    const instance = await this.#ensureInstance();
    const result = await instance.publicDecrypt(handles);
    return {
      clearValues: convertToBigIntRecord(result.clearValues),
      abiEncodedClearValues: result.abiEncodedClearValues as `0x${string}`,
      decryptionProof: result.decryptionProof as `0x${string}`,
    };
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const instance = await this.#ensureInstance();
    return instance.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    ) as unknown as KmsDelegatedUserDecryptEIP712Type;
  }

  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    const instance = await this.#ensureInstance();
    const handleContractPairs = params.handles.map((handle) => ({
      handle,
      contractAddress: params.contractAddress,
    }));
    const result = await instance.delegatedUserDecrypt(
      handleContractPairs,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.signedContractAddresses,
      params.delegatorAddress,
      params.delegateAddress,
      params.startTimestamp,
      params.durationDays,
    );
    return convertToBigIntRecord(result);
  }

  async requestZKProofVerification(_zkProof: ZKProofLike): Promise<InputProofBytesType> {
    throw new Error(
      "requestZKProofVerification is not supported in cleartext mode. Use encrypt() instead.",
    );
  }

  async getPublicKey(): Promise<{ publicKeyId: string; publicKey: Uint8Array } | null> {
    return { publicKeyId: "mock-public-key-id", publicKey: new Uint8Array(32) };
  }

  async getPublicParams(
    _bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return { publicParamsId: "mock-public-params-id", publicParams: new Uint8Array(32) };
  }
}
