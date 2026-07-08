import type { Logger } from "../logging/logger.js";
import { RpcErrorCode, failure, type JsonRpcRequest, type JsonRpcResponse } from "./jsonrpc.js";

/**
 * Forwards a JSON-RPC request unchanged to the upstream Ethereum RPC. This
 * is the fallback for every method that isn't intercepted — the wrapper
 * must behave like a normal RPC endpoint for everything it doesn't
 * explicitly rewrite.
 */
export function createUpstreamForwarder(rpcUrl: string, logger?: Logger) {
  return async function forwardToUpstream(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        logger?.error(`Upstream RPC returned HTTP ${response.status} for ${request.method}`);
        return failure(request.id, {
          code: RpcErrorCode.ServerError,
          message: `Upstream RPC returned HTTP ${response.status}`,
          data: { status: response.status, statusText: response.statusText },
        });
      }
      const body = (await response.json()) as JsonRpcResponse;
      return body;
    } catch (error) {
      logger?.error(
        `Failed to reach upstream RPC for ${request.method}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return failure(request.id, {
        code: RpcErrorCode.ServerError,
        message: "Failed to reach upstream RPC",
        data: { reason: error instanceof Error ? error.message : String(error) },
      });
    }
  };
}
