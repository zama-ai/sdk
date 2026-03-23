import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import type {
  GenericLogger,
  UpdateCsrfResponseData,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { BaseWorkerClient } from "./worker.base-client";

/** Configuration for the worker client */
export interface WorkerClientConfig {
  cdnUrl: string;
  fhevmConfig: FhevmInstanceConfig;
  csrfToken: string;
  /** Expected SHA-384 hex digest of the CDN bundle for integrity verification. */
  integrity?: string;
  /** Optional logger for tracing worker request lifecycle. */
  logger?: GenericLogger;
  /** Number of WASM threads for parallel FHE operations (passed to `initSDK({ thread })`). */
  thread?: number;
}

/**
 * Client for communicating with the RelayerSDK Web Worker.
 * Provides a promise-based API for FHE operations.
 */
export class RelayerWorkerClient extends BaseWorkerClient<Worker, WorkerClientConfig> {
  constructor(config: WorkerClientConfig) {
    super(config, config.logger);
  }

  protected createWorker(): Worker {
    return new Worker(new URL("./relayer-sdk.worker.js", import.meta.url));
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
    // Destructure to exclude `logger` — functions cannot be cloned by
    // the structured clone algorithm used by `worker.postMessage()`.
    const { logger: _, ...serializableConfig } = this.config;
    return { type: "INIT", payload: serializableConfig };
  }

  /**
   * Update the CSRF token in the worker.
   * Call this before making authenticated requests to ensure the token is fresh.
   */
  async updateCsrf(csrfToken: string): Promise<void> {
    await this.sendRequest<UpdateCsrfResponseData>("UPDATE_CSRF", { csrfToken });
  }
}
