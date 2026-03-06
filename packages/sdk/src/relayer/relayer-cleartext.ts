import { createCleartextInstance } from "../cleartext/cleartext-instance";
import { convertToBigIntRecord } from "../utils/convert";
import type { CleartextInstanceConfig } from "../cleartext/types";
import { ConfigurationError, NotSupportedError } from "../token/errors";
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
import { DefaultConfigs } from "./relayer-configs";

type CleartextInstance = ReturnType<typeof createCleartextInstance>;

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

function buildInstance(
  chainId: number,
  transports: Record<number, Partial<CleartextInstanceConfig>>,
): CleartextInstance {
  const overrides = transports[chainId];
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

  return createCleartextInstance(config);
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
  readonly #multi: RelayerCleartextMultiConfig | null;
  #instance: CleartextInstance | null;
  #resolvedChainId: number | null = null;

  constructor(config: RelayerCleartextConfig) {
    if (isMultiConfig(config)) {
      this.#multi = config;
      this.#instance = null;
    } else {
      const chainId = config.chainId;
      if (chainId == null) {
        throw new ConfigurationError(
          "Single-transport config must include a chainId, or use the multi-transport form with getChainId.",
        );
      }
      this.#multi = null;
      this.#instance = buildInstance(chainId, { [chainId]: config });
      this.#resolvedChainId = chainId;
    }
  }

  async #getInstance(): Promise<CleartextInstance> {
    if (!this.#multi) return this.#instance!;

    const chainId = await this.#multi.getChainId();

    // Chain changed → discard old instance
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#instance = null;
    }
    this.#resolvedChainId = chainId;

    if (!this.#instance) {
      this.#instance = buildInstance(chainId, this.#multi.transports);
    }

    return this.#instance;
  }

  async generateKeypair(): Promise<FHEKeypair> {
    const instance = await this.#getInstance();
    return instance.generateKeypair();
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const instance = await this.#getInstance();
    return instance.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const instance = await this.#getInstance();
    return instance.encrypt(params);
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    const instance = await this.#getInstance();
    const result = await instance.userDecrypt(params);
    return convertToBigIntRecord(result);
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    const instance = await this.#getInstance();
    return instance.publicDecrypt(handles);
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const instance = await this.#getInstance();
    return instance.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    const instance = await this.#getInstance();
    const result = await instance.delegatedUserDecrypt(params);
    return convertToBigIntRecord(result);
  }

  async requestZKProofVerification(_zkProof: ZKProofLike): Promise<InputProofBytesType> {
    throw new NotSupportedError(
      "requestZKProofVerification is not supported in cleartext mode. Use encrypt() instead.",
    );
  }

  async getPublicKey(): Promise<{ publicKeyId: string; publicKey: Uint8Array } | null> {
    const instance = await this.#getInstance();
    return instance.getPublicKey();
  }

  async getPublicParams(
    _bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const instance = await this.#getInstance();
    return instance.getPublicParams(_bits);
  }

  /**
   * Mark the instance as terminated. Unlike {@link RelayerNode} (which throws
   * on use-after-terminate), RelayerCleartext auto-restarts on the next
   * operation to support React StrictMode's unmount→remount cycle and HMR.
   */
  terminate(): void {
    this.#instance = null;
    this.#resolvedChainId = null;
  }
}
