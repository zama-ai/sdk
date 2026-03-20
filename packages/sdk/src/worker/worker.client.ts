import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import type {
  GenericLogger,
  UpdateCsrfResponseData,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { BaseWorkerClient } from "./worker.base-client";
import {
  RELAYER_SDK_CDN_URL,
  RELAYER_SDK_UMD_INTEGRITY,
  RELAYER_SDK_WORKER_CDN_URL,
} from "./worker.constants";

/** Configuration for the worker client */
export interface WorkerClientConfig {
  fhevmConfig: FhevmInstanceConfig;
  csrfToken: string;
  /** Optional logger for tracing worker request lifecycle. */
  logger?: GenericLogger;
  /** Number of WASM threads for parallel FHE operations (passed to `initSDK({ thread })`). */
  thread?: number;
  /** Whether to verify CDN bundle integrity at runtime. Defaults to `true`. */
  integrityCheck?: boolean;
}

/**
 * Client for communicating with the RelayerSDK Web Worker.
 * Provides a promise-based API for FHE operations.
 *
 * Both the worker IIFE and the relayer-sdk UMD bundle are loaded from
 * cdn.zama.org at runtime. The UMD bundle is verified with SHA-384
 * integrity inside the worker.
 */
export class RelayerWorkerClient extends BaseWorkerClient<Worker, WorkerClientConfig> {
  constructor(config: WorkerClientConfig) {
    super(config, config.logger);
  }

  protected createWorker(): Worker {
    return new Worker(RELAYER_SDK_WORKER_CDN_URL);
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
    // Only spread serializable fields — `logger` contains functions
    // which cannot be cloned by `postMessage`.
    const { fhevmConfig, csrfToken, thread, integrityCheck } = this.config;
    return {
      type: "INIT",
      payload: {
        cdnUrl: RELAYER_SDK_CDN_URL,
        integrity: integrityCheck === false ? undefined : RELAYER_SDK_UMD_INTEGRITY,
        fhevmConfig,
        csrfToken,
        thread,
      },
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
