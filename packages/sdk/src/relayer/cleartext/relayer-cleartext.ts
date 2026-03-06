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
import { createCleartextRelayer, resolveCleartextConfig } from "./factory";
import type { RelayerCleartextConfig } from "./types";

/**
 * Cleartext relayer with the same transport/getChainId shape as the other SDK relayers.
 * Resolves a chain-specific cleartext config lazily, rebuilds on chain switch,
 * and auto-restarts after `terminate()` to support React StrictMode.
 */
export class RelayerCleartext implements RelayerSDK {
  #instance: RelayerSDK | null = null;
  #ensureLock: Promise<RelayerSDK> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;
  readonly #config: RelayerCleartextConfig;

  constructor(config: RelayerCleartextConfig) {
    this.#config = config;
  }

  async #ensureInstance(): Promise<RelayerSDK> {
    if (this.#ensureLock) return this.#ensureLock;
    this.#ensureLock = this.#ensureInstanceInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  async #ensureInstanceInner(): Promise<RelayerSDK> {
    if (this.#terminated) {
      this.#terminated = false;
      this.#instance = null;
      this.#resolvedChainId = null;
    }

    const chainId = await this.#config.getChainId();

    if (this.#instance && this.#resolvedChainId === chainId) {
      return this.#instance;
    }

    this.#instance?.terminate();
    this.#instance = createCleartextRelayer(
      resolveCleartextConfig(
        chainId,
        this.#config.transports[chainId],
        this.#config.chainConfigs[chainId],
      ),
    );
    this.#resolvedChainId = chainId;
    return this.#instance;
  }

  terminate(): void {
    this.#terminated = true;
    this.#instance?.terminate();
    this.#instance = null;
    this.#ensureLock = null;
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
