/**
 * Shared contract between the main-thread encrypt client and the encrypt
 * worker, spoken over Comlink. Every payload must survive `structuredClone`:
 * no `AbortSignal`, no class instances; callbacks cross as Comlink proxies.
 */

import type { FhevmChain } from "@fhevm/sdk/chains";
import type {
  FhevmClientOptions,
  FhevmEncryptBackend,
  FhevmRelayerOptions,
  WireRuntimeConfig,
} from "../relayer/types";
import { isValidRetryAfterSeconds, readRetryAfterHeader } from "../utils/error";

type EncryptParameters = Parameters<FhevmEncryptBackend["encryptValue"]>[0];
type EncryptsParameters = Parameters<FhevmEncryptBackend["encryptValues"]>[0];

/**
 * What the worker offloads, and all the encrypt client's surface the worker
 * client implements. Key fetches stay on the calling thread, where the chain's
 * auth applies and the key never crosses back out.
 */
export type EncryptOffloadBackend = Pick<
  FhevmEncryptBackend,
  "init" | "encryptValue" | "encryptValues"
>;

/** Per-request options minus `signal`, the one non-cloneable member of the set. */
export type WireRequestOptions = Omit<FhevmRelayerOptions, "signal">;

export type WireProgressEvent = Parameters<
  NonNullable<NonNullable<EncryptParameters["options"]>["onProgress"]>
>[0];

export type WireInitPayload = {
  readonly chain: FhevmChain;
  /** RPC URL for host-chain reads; absent when reads proxy through `rpcRequest`. */
  readonly rpcUrl: string | undefined;
  /** Carries `fheEncryptionKey`, prefetched on the main thread so the worker skips the download. */
  readonly clientOptions: FhevmClientOptions;
  readonly runtime: WireRuntimeConfig;
};

/** Main-thread callback the worker uses for host-chain reads when the chain's network is an injected provider. */
export type WireRpcRequest = (args: { method: string; params?: unknown }) => Promise<unknown>;

/**
 * Main-thread callback receiving every operation's progress events, routed on
 * `id`. One channel per worker avoids minting a `MessageChannel` per call, whose
 * local port and listener would linger until garbage collection after terminate.
 * Returns `unknown`: a Comlink proxy call answers with a promise.
 */
export type WireProgressCallback = (id: number, event: WireProgressEvent) => unknown;

export type WireLogCallback = (level: "debug" | "warn" | "error", message: string) => unknown;

/**
 * The API the worker exposes over Comlink. `id` correlates an in-flight
 * operation with `abort` and with its progress events, since neither an
 * `AbortSignal` nor a per-call callback can cross the boundary cheaply. The
 * `init` callback parameters must be passed as Comlink proxies (or `null`).
 */
export type EncryptWorkerApi = {
  init(
    payload: WireInitPayload,
    rpcRequest: WireRpcRequest | null,
    log: WireLogCallback,
    onProgress: WireProgressCallback,
  ): Promise<void>;
  encryptValue(
    id: number,
    parameters: {
      readonly value: EncryptParameters["value"];
      readonly contractAddress: string;
      readonly userAddress: string;
      readonly options: WireRequestOptions | undefined;
    },
  ): ReturnType<FhevmEncryptBackend["encryptValue"]>;
  encryptValues(
    id: number,
    parameters: {
      readonly values: EncryptsParameters["values"];
      readonly contractAddress: string;
      readonly userAddress: string;
      readonly options: WireRequestOptions | undefined;
    },
  ): ReturnType<FhevmEncryptBackend["encryptValues"]>;
  abort(id: number): void;
};

/** Raw message the worker posts once its module graph has loaded, before Comlink traffic. */
export const WORKER_READY_MESSAGE = "zama-encrypt-worker-ready";

/**
 * An `Error` flattened for the boundary crossing, thrown by the worker as a
 * plain object so it survives structured clone intact. `props` carries the
 * fields the SDK's duck-typed classifiers read (`statusCode`, `retryAfter`,
 * `code`, …); a cloned `Error` instance would drop them with the prototype.
 * Reading them through the prototype chain is deliberate: upstream's `status`
 * and `relayerApiError` are prototype getters, not own fields.
 */
export type WireError = {
  readonly wireError: true;
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
  readonly props: Record<string, unknown>;
  readonly cause: WireError | undefined;
};

export function isWireError(value: unknown): value is WireError {
  // Exact `true`, not presence: an `Error` subclass carrying the key must not be
  // rehydrated as a flattened one.
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { wireError?: unknown }).wireError === true
  );
}

/**
 * Fields preserved across the boundary: what the error classifiers read off
 * `@fhevm/sdk`, relayer, and JSON-RPC errors, plus the `error`/`info` nesting
 * keys those classifiers walk alongside `cause`.
 */
const WIRE_ERROR_PROPS = [
  "statusCode",
  "status",
  "retryAfter",
  "timeoutMs",
  "relayerApiError",
  "code",
  "data",
  "shortMessage",
  "details",
  "error",
  "info",
] as const;

const MAX_CAUSE_DEPTH = 6;

/** A probe is exact where a structural walk only approximates. */
function isCloneSafe(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The `Retry-After` header survives as a plain number of seconds; the
 * `Response` object it lives on cannot cross the boundary.
 */
function retryAfterFromResponse(error: object): number | undefined {
  const response = (error as { response?: { headers?: unknown } }).response;
  return readRetryAfterHeader(response?.headers);
}

/**
 * `JSON.stringify` throws instead of returning `undefined` on a bigint or a
 * circular value; a non-Error thrown value must never fail error handling itself.
 */
function stringifyNonError(error: unknown): string {
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** The classifier fields readable off one thrown value, `Error` or plain object alike. */
function extractWireProps(source: object): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const key of WIRE_ERROR_PROPS) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined && isCloneSafe(value)) {
      props[key] = value;
    }
  }
  // The header wins over a malformed own delay (`0`, negative, `NaN`), as the
  // inline extractor in `utils/error.ts` decides it.
  if (!isValidRetryAfterSeconds(props["retryAfter"])) {
    const fromHeader = retryAfterFromResponse(source);
    if (fromHeader !== undefined) {
      props["retryAfter"] = fromHeader;
    }
  }
  return props;
}

export function toWireError(error: unknown, depth: number = MAX_CAUSE_DEPTH): WireError {
  if (isWireError(error)) {
    return error;
  }
  const nest = (cause: unknown): WireError | undefined =>
    depth > 0 && cause !== undefined ? toWireError(cause, depth - 1) : undefined;
  if (error instanceof Error) {
    return {
      wireError: true,
      name: error.name,
      message: error.message,
      stack: error.stack,
      props: extractWireProps(error),
      cause: nest(error.cause),
    };
  }
  if (typeof error === "object" && error !== null) {
    // Wallets reject with a plain `{ code, message, data }`; dropping `code`
    // would break viem's classification inside the worker.
    const { message, cause } = error as { message?: unknown; cause?: unknown };
    return {
      wireError: true,
      name: "Error",
      message: typeof message === "string" ? message : stringifyNonError(error),
      stack: undefined,
      props: extractWireProps(error),
      cause: nest(cause),
    };
  }
  return {
    wireError: true,
    name: "Error",
    message: typeof error === "string" ? error : stringifyNonError(error),
    stack: undefined,
    props: {},
    cause: undefined,
  };
}

/**
 * Rebuilds a plain `Error` carrying the original `name`, own fields, and cause
 * chain, so name-based classification and status/retry-after extraction behave
 * as if the error had been thrown on this thread.
 */
export function fromWireError(wire: WireError): Error {
  const error = new Error(wire.message, wire.cause ? { cause: fromWireError(wire.cause) } : {});
  error.name = wire.name;
  if (wire.stack !== undefined) {
    error.stack = wire.stack;
  }
  Object.assign(error, wire.props);
  return error;
}
