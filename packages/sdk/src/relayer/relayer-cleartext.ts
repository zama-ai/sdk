import type { RelayerSDK } from "./relayer-sdk";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  FhevmInstance,
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
} from "./relayer-utils";

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
  #initPromise: Promise<FhevmInstance> | null = null;
  #ensureLock: Promise<FhevmInstance> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;

  constructor(config: RelayerCleartextConfig) {
    this.#config = config;
  }

  async #ensureInstance(): Promise<FhevmInstance> {
    if (this.#ensureLock) return this.#ensureLock;
    this.#ensureLock = this.#ensureInstanceInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  async #ensureInstanceInner(): Promise<FhevmInstance> {
    if (this.#terminated) {
      throw new Error("RelayerCleartext has been terminated");
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

  async #initInstance(chainId: number): Promise<FhevmInstance> {
    const config = this.#config.transports[chainId];
    if (!config) {
      throw new Error(`No cleartext transport config for chainId: ${chainId}`);
    }

    const { createCleartextInstance } = await import("@zama-fhe/relayer-sdk/cleartext");

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
    for (const value of params.values) {
      input.add64(value);
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
      abiEncodedClearValues: result.abiEncodedClearValues,
      decryptionProof: result.decryptionProof,
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
    );
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
    return null;
  }

  async getPublicParams(
    _bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return null;
  }
}
