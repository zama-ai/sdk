import { createCleartextInstance } from "../cleartext/cleartext-instance";
import { convertToBigIntRecord } from "../utils/convert";
import type { CleartextInstanceConfig } from "../cleartext/types";
import {
  ZamaError,
  EncryptionFailedError,
  ConfigurationError,
  NotSupportedError,
} from "../token/errors";
import { assertNonNullable } from "../utils";
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
import { buildEIP712DomainType, DefaultConfigs } from "./relayer-utils";

type CleartextInstance = Awaited<ReturnType<typeof createCleartextInstance>>;

export interface RelayerCleartextMultiConfig {
  /** Resolve the current chain ID. Called lazily before each operation. */
  getChainId: () => Promise<number>;
  /** Per-chain cleartext transport configs, keyed by chain ID. */
  transports: Record<number, Partial<CleartextInstanceConfig>>;
}

/**
 * Single transport: a full or partial {@link CleartextInstanceConfig}.
 * The `chainId` field determines which {@link DefaultConfigs} entry to merge with.
 *
 * Multi-transport: a {@link RelayerCleartextMultiConfig} with per-chain configs
 * and a `getChainId` callback.
 */
export type RelayerCleartextConfig = Partial<CleartextInstanceConfig> | RelayerCleartextMultiConfig;

function isMultiConfig(config: RelayerCleartextConfig): config is RelayerCleartextMultiConfig {
  return (
    "transports" in config &&
    typeof (config as RelayerCleartextMultiConfig).getChainId === "function"
  );
}

/**
 * RelayerCleartext — cleartext encryption/decryption layer for development and testing.
 * No WASM, no workers. Reads plaintext values from a CleartextFHEVMExecutor contract.
 *
 * Accepts either a single transport config (most common) or a multi-transport config
 * with per-chain overrides and a `getChainId` callback.
 *
 * @example Single transport (recommended for local dev)
 * ```ts
 * const relayer = new RelayerCleartext(HardhatConfig);
 * ```
 *
 * @example Multi-transport (dynamic chain switching)
 * ```ts
 * const signer = EthersSigner({ ethereum: window.ethereum! })
 * const relayer = new RelayerCleartext({
 *   getChainId: () => signer.getChainId(),
 *   transports: { [HardhatConfig.chainId]: HardhatConfig, [HoodiConfig.chainId]: HoodiConfig },
 * });
 * ```
 */
export class RelayerCleartext implements RelayerSDK {
  readonly #config: RelayerCleartextMultiConfig;
  #initPromise: Promise<CleartextInstance> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;

  constructor(config: RelayerCleartextConfig) {
    if (isMultiConfig(config)) {
      this.#config = config;
    } else {
      const chainId = config.chainId;
      if (chainId == null) {
        throw new ConfigurationError(
          "Single-transport config must include a chainId, or use the multi-transport form with getChainId.",
        );
      }
      this.#config = {
        transports: { [chainId]: config },
        getChainId: async () => chainId,
      };
    }
  }

  async #ensureInstance(): Promise<CleartextInstance> {
    // Auto-restart after terminate() — discard stale state so a fresh init
    // runs. Clear #terminated here so that #initInstance's post-init guard
    // only fires if terminate() is called *during* an in-flight init.
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
        throw error instanceof ZamaError
          ? error
          : new EncryptionFailedError("Failed to initialize cleartext instance", {
              cause: error instanceof Error ? error : undefined,
            });
      });
    }
    return this.#initPromise;
  }

  async #initInstance(chainId: number): Promise<CleartextInstance> {
    const overrides = this.#config.transports[chainId];
    if (!overrides) {
      throw new ConfigurationError(`No cleartext transport config for chainId: ${chainId}`);
    }

    const base = DefaultConfigs[chainId];
    const config = { ...base, ...overrides } as CleartextInstanceConfig;
    try {
      assertNonNullable(config.network, `network`);
      assertNonNullable(config.cleartextExecutorAddress, `cleartextExecutorAddress`);
      assertNonNullable(config.coprocessorSignerPrivateKey, `coprocessorSignerPrivateKey`);
      assertNonNullable(config.kmsSignerPrivateKey, `kmsSignerPrivateKey`);
    } catch (error) {
      throw new ConfigurationError(`Incomplete cleartext config for chainId: ${chainId}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }

    const instance = await createCleartextInstance(config);

    // If terminate() was called while createCleartextInstance was in flight,
    // discard the freshly created instance — the caller will get an error and
    // the next operation will trigger a clean re-init.
    if (this.#terminated) {
      throw new Error("RelayerCleartext was terminated during initialization");
    }

    return instance;
  }

  /**
   * Mark the instance as terminated. Unlike {@link RelayerNode} (which throws
   * on use-after-terminate), RelayerCleartext auto-restarts on the next
   * operation to support React StrictMode's unmount→remount cycle and HMR.
   */
  terminate(): void {
    this.#terminated = true;
    this.#initPromise = null;
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
      } catch (error) {
        throw new EncryptionFailedError(
          `RelayerCleartext.encrypt() only supports values up to uint64 (2^64 - 1). ` +
            `For larger types (uint128, uint256, address), use createCleartextInstance() and the low-level add* methods.`,
          { cause: error instanceof Error ? error : undefined },
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
    // Cast needed: our plain `string` types don't satisfy the external lib's
    // branded `0x${string}` / ChecksummedAddress types, but values are correct.
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
    throw new NotSupportedError(
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
