import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import type {
  GenericLogger,
  UpdateCsrfResponseData,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { BaseWorkerClient } from "./worker.base-client";
import { getBrowserExtensionRuntime } from "../utils";
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
}

/**
 * Client for communicating with the RelayerSDK Web Worker.
 * Provides a promise-based API for FHE operations.
 *
 * The worker IIFE and relayer-sdk UMD bundle are loaded on demand from
 * co-located files, keeping the main bundle small.
 */
export class RelayerWorkerClient extends BaseWorkerClient<Worker, WorkerClientConfig> {
  constructor(config: WorkerClientConfig) {
    super(config, config.logger);
  }

  protected createWorker(): Worker {
    const runtime = getBrowserExtensionRuntime();
    if (runtime) {
      return new Worker(runtime.getURL(workerFilename));
    }
    // Load the worker from the co-located file emitted at build time.
    // Modern bundlers (webpack 5, Vite, Rolldown) resolve `new URL(..., import.meta.url)`
    // and copy the asset to the output directory automatically.
    const workerUrl = new URL(workerFilename, import.meta.url);
    return new Worker(workerUrl);
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
    // Resolve the relayer-sdk UMD URL: use extension runtime API when
    // available, otherwise resolve relative to this module.
    const runtime = getBrowserExtensionRuntime();
    const sdkUrl = runtime
      ? runtime.getURL(RELAYER_SDK_UMD_FILENAME)
      : new URL(RELAYER_SDK_UMD_FILENAME, import.meta.url).href;

    // Only spread serializable fields — `logger` contains functions
    // which cannot be cloned by `postMessage`.
    const { fhevmConfig, csrfToken, thread } = this.config;
    return { type: "INIT", payload: { sdkUrl, fhevmConfig, csrfToken, thread } };
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
