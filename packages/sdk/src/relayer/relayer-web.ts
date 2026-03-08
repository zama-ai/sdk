import { Effect, Layer } from "effect";
import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  RelayerSDKStatus,
  RelayerWebConfig,
  UserDecryptParams,
} from "./relayer-sdk.types";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import type { RelayerSDK } from "./relayer-sdk";
import { mergeFhevmConfig } from "./relayer-utils";
import { ZamaError, EncryptionFailedError } from "../token/errors";
import { Relayer } from "../services/Relayer";
import { buildRelayerService } from "./relayer-service";

/**
 * Pinned relayer SDK version used for the WASM CDN bundle.
 * Update this when upgrading @zama-fhe/relayer-sdk, and keep the
 * peerDependencies range in package.json in sync (~x.y.z).
 */
const RELAYER_SDK_VERSION = "0.4.1";
const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}/relayer-sdk-js.umd.cjs`;
/** SHA-384 hex digest of the pinned CDN bundle for integrity verification. */
const CDN_INTEGRITY =
  "2bd5401738b74509549bed2029bbbabedd481b10ac260f66e64a4ff3723d6d704180c51e882757c56ca1840491e90e33";

/**
 * RelayerWeb — browser encryption/decryption layer using a Web Worker.
 * Handles WASM initialization in a Web Worker for non-blocking operations.
 *
 * ## Worker initialization / promise lock pattern
 *
 * Every public method calls `#ensureWorker()` before proceeding.
 * Initialization is managed by three private fields:
 *
 * - `#workerClient` — the live worker instance (null until first init)
 * - `#initPromise` — cached promise from `#initWorker()`; once resolved,
 *   all subsequent callers reuse the same worker without re-initializing.
 *   Cleared on error so the next caller retries a fresh init.
 * - `#ensureLock` — short-lived promise that serializes concurrent calls
 *   to `#ensureWorkerInner()`. While one caller is checking chain IDs and
 *   potentially tearing down an old worker, all other callers await the
 *   same lock instead of racing through the same logic. Cleared in
 *   `finally` so it's never leaked.
 *
 * Chain switching: when `getChainId()` returns a value different from the
 * previously resolved chain, the old worker is terminated, `#initPromise`
 * is cleared, and a fresh worker is created for the new chain — all within
 * the `#ensureLock` critical section.
 */
export class RelayerWeb implements RelayerSDK {
  #workerClient: RelayerWorkerClient | null = null;
  #layer: Layer.Layer<Relayer> | null = null;
  #initPromise: Promise<RelayerWorkerClient> | null = null;
  #ensureLock: Promise<RelayerWorkerClient> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;
  #status: RelayerSDKStatus = "idle";
  #initError: Error | undefined;
  readonly #config: RelayerWebConfig;

  constructor(config: RelayerWebConfig) {
    this.#config = config;
  }

  /** Current WASM initialization status. */
  get status(): RelayerSDKStatus {
    return this.#status;
  }

  /** The error that caused initialization to fail, if `status` is `"error"`. */
  get initError(): Error | undefined {
    return this.#initError;
  }

  #setStatus(status: RelayerSDKStatus, error?: Error): void {
    this.#status = status;
    this.#initError = error;
    this.#config.onStatusChange?.(status, error);
  }

  async #getWorkerConfig(): Promise<WorkerClientConfig> {
    const chainId = await this.#config.getChainId();
    const { transports, security, threads } = this.#config;

    if (threads !== undefined && (!Number.isInteger(threads) || threads < 1)) {
      throw new Error(`Invalid thread count: ${threads}. Must be a positive integer.`);
    }

    if (threads !== undefined && typeof globalThis.SharedArrayBuffer === "undefined") {
      this.#config.logger?.warn(
        "threads option requires SharedArrayBuffer (COOP/COEP headers). Falling back to single-threaded.",
      );
    }

    return {
      cdnUrl: CDN_URL,
      fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
      csrfToken: security?.getCsrfToken?.() ?? "",
      integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
      logger: this.#config.logger,
      // Public API uses `threads` (plural, "how many threads"); upstream
      // `initSDK` expects `thread` (singular) — rename at the boundary.
      thread: threads,
    };
  }

  /**
   * Ensure the worker is initialized.
   * Uses a promise lock to prevent concurrent initialization.
   * Resets on failure to allow retries.
   */
  async #ensureWorker(): Promise<RelayerWorkerClient> {
    if (this.#ensureLock) return this.#ensureLock;
    this.#ensureLock = this.#ensureWorkerInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  async #ensureWorkerInner(): Promise<RelayerWorkerClient> {
    // Auto-restart after terminate() — supports React StrictMode's
    // unmount→remount cycle and HMR without permanently killing the worker.
    if (this.#terminated) {
      this.#terminated = false;
      this.#workerClient = null;
      this.#layer = null;
      this.#initPromise = null;
      this.#resolvedChainId = null;
    }

    const chainId = await this.#config.getChainId();

    // Chain changed → tear down old worker, re-init
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#workerClient?.terminate();
      this.#workerClient = null;
      this.#layer = null;
      this.#initPromise = null;
    }

    this.#resolvedChainId = chainId;

    if (!this.#initPromise) {
      this.#setStatus("initializing");
      this.#initPromise = this.#initWorker()
        .then((client) => {
          this.#setStatus("ready");
          return client;
        })
        .catch((error) => {
          this.#initPromise = null;
          const wrappedError =
            error instanceof ZamaError
              ? error
              : new EncryptionFailedError("Failed to initialize FHE worker", {
                  cause: error instanceof Error ? error : undefined,
                });
          this.#setStatus("error", wrappedError);
          throw wrappedError;
        });
    }
    return this.#initPromise;
  }

  async #initWorker(): Promise<RelayerWorkerClient> {
    const workerConfig = await this.#getWorkerConfig();
    const client = new RelayerWorkerClient(workerConfig);
    await client.initWorker();
    if (this.#terminated) {
      client.terminate();
      throw new Error("RelayerWeb was terminated during initialization");
    }
    this.#workerClient = client;
    return client;
  }

  /** Run an Effect program against the Relayer service backed by the current worker. */
  async #runEffect<A, E>(effect: Effect.Effect<A, E, Relayer>): Promise<A> {
    const client = await this.#ensureWorker();
    if (!this.#layer) {
      this.#layer = Layer.succeed(
        Relayer,
        buildRelayerService(client, () => {
          const token = this.#config.security?.getCsrfToken?.() ?? "";
          if (token) {
            return Effect.tryPromise(() => client.updateCsrf(token)).pipe(Effect.orDie);
          }
          return Effect.void;
        }),
      );
    }
    return Effect.runPromise(effect.pipe(Effect.provide(this.#layer)));
  }

  /**
   * Terminate the worker and clean up resources.
   * Call this when the SDK is no longer needed.
   */
  terminate(): void {
    this.#terminated = true;
    if (this.#workerClient) {
      this.#workerClient.terminate();
      this.#workerClient = null;
    }
    this.#layer = null;
    this.#initPromise = null;
    this.#ensureLock = null;
  }

  async generateKeypair(): Promise<KeypairType<string>> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.generateKeypair()));
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    return this.#runEffect(
      Effect.flatMap(Relayer, (r) =>
        r.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays),
      ),
    );
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.encrypt(params)));
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.userDecrypt(params)));
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.publicDecrypt(handles)));
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return this.#runEffect(
      Effect.flatMap(Relayer, (r) =>
        r.createDelegatedUserDecryptEIP712(
          publicKey,
          contractAddresses,
          delegatorAddress,
          startTimestamp,
          durationDays,
        ),
      ),
    );
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.delegatedUserDecrypt(params)));
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.requestZKProofVerification(zkProof)));
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.getPublicKey()));
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.getPublicParams(bits)));
  }
}
