import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { RelayerChainConfig } from "../chains/types";
import type {
  GenericLogger,
  WorkerEnv,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { BaseWorkerClient } from "./worker.base-client";

export interface NodeWorkerClientConfig {
  chains: RelayerChainConfig[];
  /** Optional logger for tracing worker request lifecycle. */
  logger?: GenericLogger;
}

/**
 * Client for communicating with the RelayerSDK Node.js worker thread.
 * Provides a promise-based API for FHE operations using node:worker_threads.
 */
export class NodeWorkerClient extends BaseWorkerClient<Worker, NodeWorkerClientConfig> {
  protected readonly env: WorkerEnv = "node";

  constructor(config: NodeWorkerClientConfig) {
    super(config, config.logger);
  }

  protected createWorker(): Worker {
    // Resolve relative to the @zama-fhe/sdk/node entry point so the path is
    // correct regardless of which rolldown chunk this code lands in.
    const nodeEntry = new URL(import.meta.resolve("@zama-fhe/sdk/node"));
    return new Worker(new URL("relayer-sdk.node-worker.js", nodeEntry));
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
      type: "INIT",
      payload: { env: "node" as const, chains: this.config.chains },
    };
  }

  protected override onWorkerReady(worker: Worker): void {
    worker.unref();
  }
}
