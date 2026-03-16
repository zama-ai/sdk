import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import type {
  GenericLogger,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { BaseWorkerClient } from "./worker.base-client";

export interface NodeWorkerClientConfig {
  fhevmConfig: FhevmInstanceConfig;
  /** Optional logger for tracing worker request lifecycle. */
  logger?: GenericLogger;
}

/**
 * Client for communicating with the RelayerSDK Node.js worker thread.
 * Provides a promise-based API for FHE operations using node:worker_threads.
 */
export class NodeWorkerClient extends BaseWorkerClient<Worker, NodeWorkerClientConfig> {
  constructor(config: NodeWorkerClientConfig) {
    super(config, config.logger);
  }

  protected createWorker(): Worker {
    return new Worker(new URL("relayer-sdk.node-worker.js", import.meta.url));
  }

  protected wireEvents(worker: Worker): void {
    worker.on("message", (response: WorkerResponse<unknown>) => this.handleResponse(response));
    worker.on("error", (error: Error) => this.handleWorkerError(error.message));
    worker.on("messageerror", () => this.handleWorkerMessageError());
  }

  protected postMessage(worker: Worker, request: WorkerRequest): void {
    worker.postMessage(request);
  }

  protected terminateWorker(worker: Worker): void {
    void worker.terminate();
  }

  protected generateRequestId(): string {
    return randomUUID();
  }

  protected getInitPayload(): {
    type: WorkerRequestType;
    payload: WorkerRequest["payload"];
  } {
    return {
      type: "NODE_INIT",
      payload: { fhevmConfig: this.config.fhevmConfig },
    };
  }

  protected override onWorkerReady(worker: Worker): void {
    worker.unref();
  }
}
