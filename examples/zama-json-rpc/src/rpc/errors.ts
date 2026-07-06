import { matchZamaError } from "@zama-fhe/sdk";
import { RpcErrorCode, type JsonRpcError } from "./jsonrpc.js";

/**
 * Maps SDK errors to structured JSON-RPC errors using the SDK's own
 * `matchZamaError` classifier, instead of a generic catch-all — so callers
 * get the same signal (e.g. relayer back-pressure `retryable`/`retryAfter`)
 * they'd get calling the SDK directly. See SDK-236 for where this data comes
 * from on the relayer side.
 */
export function mapSdkErrorToJsonRpc(error: unknown): JsonRpcError {
  return matchZamaError<JsonRpcError>(error, {
    RELAYER_REQUEST_FAILED: (e) => ({
      code: RpcErrorCode.ServerError,
      message: "Zama relayer request failed",
      data: {
        reason: e.message,
        statusCode: e.statusCode,
        retryable: e.retryable,
        retryAfter: e.retryAfter,
      },
    }),
    RPC_RATE_LIMITED: (e) => ({
      code: RpcErrorCode.ServerError,
      message: "Upstream RPC rate-limited the request",
      data: { reason: e.message, retryable: true },
    }),
    ENCRYPTION_FAILED: (e) => ({
      code: RpcErrorCode.ServerError,
      message: "Zama SDK encryption failed",
      data: { reason: e.message },
    }),
    CONFIGURATION: (e) => ({
      code: RpcErrorCode.InternalError,
      message: "Zama SDK misconfiguration",
      data: { reason: e.message },
    }),
    OPERATION_TIMEOUT: (e) => ({
      code: RpcErrorCode.ServerError,
      message: "Zama SDK operation timed out",
      data: { reason: e.message, retryable: true },
    }),
    WORKER_RECYCLED: (e) => ({
      code: RpcErrorCode.ServerError,
      message: "Zama SDK worker was recycled mid-operation",
      data: { reason: e.message, retryable: true },
    }),
    _: (e) => ({
      code: RpcErrorCode.ServerError,
      message: "Zama SDK error",
      data: { reason: e instanceof Error ? e.message : String(e) },
    }),
  }) as JsonRpcError;
}
