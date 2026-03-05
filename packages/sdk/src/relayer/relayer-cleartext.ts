import { createCleartextInstance } from "../cleartext/cleartext-instance";
import { convertToBigIntRecord } from "../utils/convert";
import type { CleartextInstanceConfig } from "../cleartext/types";
import { EncryptionFailedError, ConfigurationError, NotSupportedError } from "../token/errors";
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

  /**
   * Mark the instance as terminated. Unlike {@link RelayerNode} (which throws
   * on use-after-terminate), RelayerCleartext auto-restarts on the next
   * operation to support React StrictMode's unmount→remount cycle and HMR.
   */
  terminate(): void {
    this.#instance = null;
    this.#resolvedChainId = null;
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
        publicKey: result.message.publicKey,
        contractAddresses: [...result.message.contractAddresses],
        startTimestamp: result.message.startTimestamp,
        durationDays: result.message.durationDays,
        extraData: result.message.extraData,
      },
    };
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const instance = await this.#getInstance();
    const input = instance.createEncryptedInput(params.contractAddress, params.userAddress);
    for (const { type, value } of params.values) {
      try {
        if (type === "ebool") {
          input.addBool(value);
        } else if (type === "eaddress") {
          input.addAddress(String(value));
        } else {
          // All euintN types expect number | bigint
          const n = typeof value === "boolean" ? BigInt(value) : value;
          switch (type) {
            case "euint4":
              input.add4(n);
              break;
            case "euint8":
              input.add8(n);
              break;
            case "euint16":
              input.add16(n);
              break;
            case "euint32":
              input.add32(n);
              break;
            case "euint64":
              input.add64(n);
              break;
            case "euint128":
              input.add128(n);
              break;
            case "euint256":
              input.add256(n);
              break;
            default:
              throw new Error(`Unsupported FHE type: ${type as string}`);
          }
        }
      } catch (error) {
        if (error instanceof EncryptionFailedError) throw error;
        throw new EncryptionFailedError(
          `RelayerCleartext.encrypt() failed for type "${type}": ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
    }
    const encrypted = await input.encrypt();
    return { handles: encrypted.handles, inputProof: encrypted.inputProof };
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    const instance = await this.#getInstance();
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
    const instance = await this.#getInstance();
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
    const instance = await this.#getInstance();
    return instance.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    ) as unknown as KmsDelegatedUserDecryptEIP712Type;
  }

  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    const instance = await this.#getInstance();
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
    const instance = await this.#getInstance();
    return instance.getPublicKey();
  }

  async getPublicParams(
    _bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const instance = await this.#getInstance();
    return instance.getPublicParams();
  }
}
