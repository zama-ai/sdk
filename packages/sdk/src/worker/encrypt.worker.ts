import { expose } from "comlink";
import { createFhevmEncryptClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import { createPublicClient, custom, http } from "viem";
import type {
  EncryptOffloadBackend,
  EncryptWorkerApi,
  WireInitPayload,
  WireLogCallback,
  WireProgressCallback,
  WireRpcRequest,
} from "./protocol";
import { WORKER_READY_MESSAGE, fromWireError, isWireError, toWireError } from "./protocol";

/**
 * Worker entry for offloaded encryption. Owns a full `@fhevm/sdk` encrypt
 * client in the worker realm so the synchronous TFHE WASM work (ciphertext
 * building + ZK proof) never blocks the page's main thread. The FHE key arrives
 * in the init payload, fetched by the main thread under the chain's auth: the
 * worker performs no heavy downloads of its own.
 */

type WorkerScope = { postMessage(message: unknown): void };

let client: EncryptOffloadBackend | undefined;
/** The one progress channel back to the main thread, registered at init and shared by every operation. */
let reportProgress: WireProgressCallback | undefined;

const abortControllers = new Map<number, AbortController>();

/**
 * Fire-and-forget for a Comlink proxy call: it answers with a promise, and a
 * main-thread callback that threw rejects it, which would surface here as an
 * unhandled rejection.
 */
function relay(call: unknown): void {
  void Promise.resolve(call).catch(() => {});
}

/** Per-operation view of the shared channel: the main thread routes on `id`. */
function progressFor(id: number): (event: Parameters<WireProgressCallback>[1]) => void {
  return (event) => relay(reportProgress?.(id, event));
}

function requireClient(): EncryptOffloadBackend {
  if (client === undefined) {
    throw new Error("Encrypt worker used before init.");
  }
  return client;
}

/**
 * Runs `operation` with an abort signal registered under `id`, so a later
 * `abort(id)` from the main thread cancels it. The caller's `AbortSignal`
 * itself cannot cross the boundary. Failures leave as plain `WireError`
 * objects: they survive structured clone intact, where a cloned `Error` would
 * lose the fields the SDK's classifiers read.
 */
async function abortable<T>(
  id: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  abortControllers.set(id, controller);
  try {
    return await operation(controller.signal);
  } catch (error) {
    throw toWireError(error);
  } finally {
    abortControllers.delete(id);
  }
}

const api: EncryptWorkerApi = {
  init(
    payload: WireInitPayload,
    rpcRequest: WireRpcRequest | null,
    log: WireLogCallback,
    onProgress: WireProgressCallback,
  ): Promise<void> {
    reportProgress = onProgress;
    setFhevmRuntimeConfig({
      ...payload.runtime,
      logger: {
        debug: (message) => relay(log("debug", message)),
        warn: (message) => relay(log("warn", message)),
        error: (message) => relay(log("error", message)),
      },
    });
    // The main-thread provider's rejection arrives flattened, so rebuild it here
    // and let viem and the SDK classify it on `code` as they would inline.
    const request = async (args: { method: string; params?: unknown }) => {
      if (rpcRequest === null) {
        throw new Error("No RPC available.");
      }
      try {
        return await rpcRequest(args);
      } catch (error) {
        throw isWireError(error) ? fromWireError(error) : error;
      }
    };
    const transport = payload.rpcUrl !== undefined ? http(payload.rpcUrl) : custom({ request });
    client = createFhevmEncryptClient({
      publicClient: createPublicClient({ transport }),
      chain: payload.chain,
      options: payload.clientOptions,
    });
    return client.init().catch((error: unknown) => {
      throw toWireError(error);
    });
  },

  encryptValue(id, parameters) {
    return abortable(id, (signal) =>
      requireClient().encryptValue({
        ...parameters,
        options: { ...parameters.options, signal, onProgress: progressFor(id) },
      }),
    );
  },

  encryptValues(id, parameters) {
    return abortable(id, (signal) =>
      requireClient().encryptValues({
        ...parameters,
        options: { ...parameters.options, signal, onProgress: progressFor(id) },
      }),
    );
  },

  abort(id) {
    abortControllers.get(id)?.abort();
  },
};

expose(api);
(globalThis as unknown as WorkerScope).postMessage(WORKER_READY_MESSAGE);
