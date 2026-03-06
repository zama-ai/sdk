import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
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
import { createCleartextRelayer } from "./factory";
import type { CleartextInstanceConfig } from "./types";
import { ConfigurationError } from "../../token/errors";

/**
 * Public API wrapper around `CleartextFhevmInstance`.
 *
 * Accepts a single `CleartextInstanceConfig` or a
 * `Record<number, CleartextInstanceConfig>` (multi-transport) with a
 * `getChainId` resolver.
 *
 * All methods delegate to the underlying instance created via
 * `createCleartextRelayer()`. Lazy-initializes and caches per chain.
 * `terminate()` nullifies the instance (auto-restarts on next op,
 * supports React StrictMode).
 */
export class RelayerCleartext implements RelayerSDK {
  #instance: RelayerSDK | null = null;
  #resolvedChainId: number | null = null;
  readonly #singleConfig: CleartextInstanceConfig | null;
  readonly #multiConfigs: Record<number, CleartextInstanceConfig> | null;
  readonly #getChainId: (() => Promise<number>) | null;

  constructor(config: CleartextInstanceConfig);
  constructor(config: {
    transports: Record<number, CleartextInstanceConfig>;
    getChainId: () => Promise<number>;
  });
  constructor(
    config:
      | CleartextInstanceConfig
      | {
          transports: Record<number, CleartextInstanceConfig>;
          getChainId: () => Promise<number>;
        },
  ) {
    if ("transports" in config) {
      this.#singleConfig = null;
      this.#multiConfigs = config.transports;
      this.#getChainId = config.getChainId;
    } else {
      this.#singleConfig = config;
      this.#multiConfigs = null;
      this.#getChainId = null;
    }
  }

  async #ensureInstance(): Promise<RelayerSDK> {
    if (this.#singleConfig) {
      if (!this.#instance) {
        this.#instance = createCleartextRelayer(this.#singleConfig);
      }
      return this.#instance;
    }

    const chainId = await this.#getChainId!();

    if (this.#instance && this.#resolvedChainId === chainId) {
      return this.#instance;
    }

    // Chain changed or first init
    this.#instance?.terminate();
    const chainConfig = this.#multiConfigs![chainId];
    if (!chainConfig) {
      throw new ConfigurationError(`No cleartext config for chainId: ${chainId}`);
    }
    this.#instance = createCleartextRelayer(chainConfig);
    this.#resolvedChainId = chainId;
    return this.#instance;
  }

  terminate(): void {
    this.#instance?.terminate();
    this.#instance = null;
    this.#resolvedChainId = null;
  }

  async generateKeypair(): Promise<KeypairType<string>> {
    return (await this.#ensureInstance()).generateKeypair();
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return (await this.#ensureInstance()).createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return (await this.#ensureInstance()).encrypt(params);
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#ensureInstance()).userDecrypt(params);
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return (await this.#ensureInstance()).publicDecrypt(handles);
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return (await this.#ensureInstance()).createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#ensureInstance()).delegatedUserDecrypt(params);
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return (await this.#ensureInstance()).requestZKProofVerification(zkProof);
  }

  async getPublicKey(): Promise<{ publicKeyId: string; publicKey: Uint8Array } | null> {
    return (await this.#ensureInstance()).getPublicKey();
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return (await this.#ensureInstance()).getPublicParams(bits);
  }
}
