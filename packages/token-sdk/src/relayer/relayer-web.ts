import type {
  Hex,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  RelayerWebConfig,
  UserDecryptParams,
  ZKProofLike,
} from "./relayer-sdk.types";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import type { RelayerSDK } from "./relayer-sdk";
import { mergeFhevmConfig } from "./relayer-utils";
import packageJson from "../../package.json";

const SDK_VERSION = packageJson.devDependencies["@zama-fhe/relayer-sdk"];
const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${SDK_VERSION}/relayer-sdk-js.umd.cjs`;

/**
 * RelayerWeb — browser FHE backend using a Web Worker.
 * Handles WASM initialization in a Web Worker for non-blocking operations.
 */
export class RelayerWeb implements RelayerSDK {
  #workerClient: RelayerWorkerClient | null = null;
  #initPromise: Promise<RelayerWorkerClient> | null = null;
  readonly #config: RelayerWebConfig;

  constructor(config: RelayerWebConfig) {
    this.#config = config;
  }

  /**
   * Get or create the worker client configuration.
   */
  #resolveCsrfToken(): string {
    const token = this.#config.csrfToken;
    return (typeof token === "function" ? token() : token) ?? "";
  }

  #getWorkerConfig(): WorkerClientConfig {
    const { chainId, transports } = this.#config;

    return {
      cdnUrl: CDN_URL,
      fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
      csrfToken: this.#resolveCsrfToken(),
    };
  }

  /**
   * Ensure the worker is initialized.
   * Uses a promise lock to prevent concurrent initialization.
   * Resets on failure to allow retries.
   */
  async #ensureWorker(): Promise<RelayerWorkerClient> {
    if (!this.#initPromise) {
      this.#initPromise = this.#initWorker().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  /**
   * Initialize the worker (called once via promise lock).
   */
  async #initWorker(): Promise<RelayerWorkerClient> {
    const workerConfig = this.#getWorkerConfig();
    this.#workerClient = new RelayerWorkerClient(workerConfig);
    await this.#workerClient.initWorker();
    return this.#workerClient;
  }

  /**
   * Terminate the worker and clean up resources.
   * Call this when the SDK is no longer needed.
   */
  terminate(): void {
    if (this.#workerClient) {
      this.#workerClient.terminate();
      this.#workerClient = null;
      this.#initPromise = null;
    }
  }

  /**
   * Refresh the CSRF token in the worker.
   * Call this before making authenticated network requests.
   */
  async #refreshCsrfToken(): Promise<void> {
    if (this.#workerClient) {
      const token = this.#resolveCsrfToken();
      if (token) {
        await this.#workerClient.updateCsrf(token);
      }
    }
  }

  /**
   * Generate a keypair for FHE operations.
   */
  async generateKeypair(): Promise<FHEKeypair> {
    const worker = await this.#ensureWorker();
    const result = await worker.generateKeypair();
    return {
      publicKey: result.publicKey,
      privateKey: result.privateKey,
    };
  }

  /**
   * Create EIP712 typed data for user decryption authorization.
   */
  async createEIP712(
    publicKey: string,
    contractAddresses: Hex[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const worker = await this.#ensureWorker();
    const result = await worker.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );

    return {
      domain: {
        name: result.domain.name,
        version: result.domain.version,
        chainId: result.domain.chainId,
        verifyingContract: result.domain.verifyingContract,
      },
      types: {
        UserDecryptRequestVerification: result.types.UserDecryptRequestVerification,
      },
      message: {
        publicKey: result.message.publicKey,
        contractAddresses: result.message.contractAddresses,
        startTimestamp: result.message.startTimestamp,
        durationDays: result.message.durationDays,
        extraData: result.message.extraData,
      },
    };
  }

  /**
   * Encrypt values for use in smart contract calls.
   * All values are treated as 64-bit unsigned integers.
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const { values, contractAddress, userAddress } = params;

    const worker = await this.#ensureWorker();
    await this.#refreshCsrfToken();
    const result = await worker.encrypt(values, contractAddress, userAddress);

    return {
      handles: result.handles,
      inputProof: result.inputProof,
    };
  }

  /**
   * Decrypt ciphertexts using user's private key.
   * Requires a valid EIP712 signature.
   */
  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    const worker = await this.#ensureWorker();
    await this.#refreshCsrfToken();

    const result = await worker.userDecrypt(
      params.handles,
      params.contractAddress,
      params.signedContractAddresses,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.signerAddress,
      params.startTimestamp,
      params.durationDays,
    );

    return result.clearValues;
  }

  /**
   * Public decryption - no authorization needed.
   * Used for publicly visible encrypted values.
   */
  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    const worker = await this.#ensureWorker();
    await this.#refreshCsrfToken();
    const result = await worker.publicDecrypt(handles);

    return {
      clearValues: result.clearValues,
      abiEncodedClearValues: result.abiEncodedClearValues,
      decryptionProof: result.decryptionProof,
    };
  }

  /**
   * Create EIP712 typed data for delegated user decryption authorization.
   */
  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Hex[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const worker = await this.#ensureWorker();
    return worker.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  /**
   * Decrypt ciphertexts via delegation.
   * Requires a valid EIP712 signature from the delegator.
   */
  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    const worker = await this.#ensureWorker();
    await this.#refreshCsrfToken();

    const result = await worker.delegatedUserDecrypt(
      params.handles,
      params.contractAddress,
      params.signedContractAddresses,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.delegatorAddress,
      params.delegateAddress,
      params.startTimestamp,
      params.durationDays,
    );

    return result.clearValues;
  }

  /**
   * Submit a ZK proof to the relayer for verification.
   */
  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    const worker = await this.#ensureWorker();
    await this.#refreshCsrfToken();
    return worker.requestZKProofVerification(zkProof);
  }

  /**
   * Get the TFHE compact public key.
   */
  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const worker = await this.#ensureWorker();
    return (await worker.getPublicKey()).result;
  }

  /**
   * Get public parameters for encryption capacity.
   */
  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const worker = await this.#ensureWorker();
    return (await worker.getPublicParams(bits)).result;
  }
}
