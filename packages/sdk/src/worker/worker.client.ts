import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import type {
  GenericLogger,
  UpdateCsrfResponseData,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { BaseWorkerClient } from "./worker.base-client";
import { filename as workerFilename } from "./relayer-sdk.worker.ts?iife";
import { RELAYER_SDK_UMD_FILENAME } from "./worker.constants";

/** Configuration for the worker client */
export interface WorkerClientConfig {
  fhevmConfig: FhevmInstanceConfig;
  csrfToken: string;
  /** Optional logger for tracing worker request lifecycle. */
  logger?: GenericLogger;
  /** Number of WASM threads for parallel FHE operations (passed to `initSDK({ thread })`). */
  thread?: number;
  /** Resolve asset filenames to URLs. Defaults to `new URL(name, import.meta.url)`. */
  resolveAssetUrl?: (filename: string) => URL | string;
}

/** Default asset resolver — works with Vite, webpack 5, Next.js. */
function defaultResolveAssetUrl(filename: string): URL {
  return new URL(filename, import.meta.url);
}

/** Normalize a URL | string to a string href. */
function toHref(url: URL | string): string {
  return url instanceof URL ? url.href : String(url);
}

/**
 * Client for communicating with the RelayerSDK Web Worker.
 * Provides a promise-based API for FHE operations.
 *
 * The worker IIFE and relayer-sdk UMD bundle are loaded on demand from
 * co-located files, keeping the main bundle small.
 */
export class RelayerWorkerClient extends BaseWorkerClient<Worker, WorkerClientConfig> {
  readonly #resolveAssetUrl: (filename: string) => URL | string;

  constructor(config: WorkerClientConfig) {
    super(config, config.logger);
    this.#resolveAssetUrl = config.resolveAssetUrl ?? defaultResolveAssetUrl;
  }

  protected createWorker(): Worker {
    const url = this.#resolveAssetUrl(workerFilename);
    return new Worker(url);
  }

  protected wireEvents(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<WorkerResponse<unknown>>) =>
      this.handleResponse(event.data);
    worker.onerror = (event: ErrorEvent) => this.handleWorkerError(event.message);
    worker.onmessageerror = () => this.handleWorkerMessageError();
  }

  protected postMessage(worker: Worker, request: WorkerRequest): void {
    worker.postMessage(request);
  }

  protected terminateWorker(worker: Worker): void {
    worker.terminate();
  }

  protected generateRequestId(): string {
    return crypto.randomUUID();
  }

  protected getInitPayload(): {
    type: WorkerRequestType;
    payload: WorkerRequest["payload"];
  } {
    const sdkUrl = toHref(this.#resolveAssetUrl(RELAYER_SDK_UMD_FILENAME));

    // Only spread serializable fields — `logger` contains functions
    // which cannot be cloned by `postMessage`.
    const { fhevmConfig, csrfToken, thread } = this.config;
    return {
      type: "INIT",
      payload: { sdkUrl, fhevmConfig, csrfToken, thread },
    };
  }

  /**
   * Update the CSRF token in the worker.
   * Call this before making authenticated requests to ensure the token is fresh.
   */
  async updateCsrf(csrfToken: string): Promise<void> {
    await this.sendRequest<UpdateCsrfResponseData>("UPDATE_CSRF", {
      csrfToken,
    });
  }
}
