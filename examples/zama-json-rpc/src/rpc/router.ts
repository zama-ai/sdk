import type { ZamaSDK } from "@zama-fhe/sdk";
import type { ConfidentialOperationRegistry } from "../registry/index.js";
import type { TokenValidityCache } from "../registry/token-validity-cache.js";
import type { Logger } from "../logging/logger.js";
import { maybeRewriteTransaction } from "../zama/rewriter.js";
import { parseEthTransactionParams } from "../zama/eth-transaction.js";
import { InvalidRewriteRequestError } from "../zama/errors.js";
import { mapSdkErrorToJsonRpc } from "./errors.js";
import {
  RpcErrorCode,
  failure,
  isValidJsonRpcRequest,
  success,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./jsonrpc.js";
import type { createUpstreamForwarder } from "./passthrough.js";

export interface RouterDeps {
  sdk: ZamaSDK;
  registry: ConfidentialOperationRegistry;
  tokenValidityCache: TokenValidityCache;
  chainId: number;
  logger: Logger;
  forwardToUpstream: ReturnType<typeof createUpstreamForwarder>;
  zamaHandlers: Record<string, (rpcParams: unknown[]) => unknown>;
}

/**
 * Every method whose first param is a tx-shaped object (`{from, to, data}`)
 * that can target a confidential operation. Not just `eth_sendTransaction`:
 * a client that estimates gas or simulates against the plaintext-looking
 * shape before sending would get a bogus estimate/revert against the real
 * contract (which has no `transfer(address,uint256)` selector) — the same
 * rewrite has to apply to all three for the plaintext-looking call to
 * behave consistently end-to-end.
 */
const REWRITABLE_METHODS = new Set(["eth_sendTransaction", "eth_call", "eth_estimateGas"]);

export async function handleSingleRequest(
  request: unknown,
  deps: RouterDeps,
): Promise<JsonRpcResponse> {
  if (!isValidJsonRpcRequest(request)) {
    const id = (request as { id?: JsonRpcRequest["id"] } | null)?.id ?? null;
    return failure(id, { code: RpcErrorCode.InvalidRequest, message: "Invalid Request" });
  }

  const zamaHandler = deps.zamaHandlers[request.method];
  if (zamaHandler) {
    try {
      const result = await zamaHandler(request.params ?? []);
      return success(request.id, result);
    } catch (error) {
      return failure(request.id, mapSdkErrorToJsonRpc(error));
    }
  }

  if (request.method.startsWith("zama_")) {
    return failure(request.id, {
      code: RpcErrorCode.MethodNotFound,
      message: `Zama method not allowed: ${request.method}`,
    });
  }

  if (REWRITABLE_METHODS.has(request.method)) {
    const txParams = parseEthTransactionParams(request.params?.[0]);
    try {
      const { data } = await maybeRewriteTransaction({
        sdk: deps.sdk,
        registry: deps.registry,
        tokenValidityCache: deps.tokenValidityCache,
        chainId: deps.chainId,
        tx: txParams,
        logger: deps.logger,
        method: request.method,
      });
      const rewrittenTx: Record<string, unknown> = { ...txParams, data };
      // Some clients (and upstream nodes) key off `input` instead of `data` —
      // keep both in sync when the caller used `input`, rather than silently
      // dropping their field name.
      if (txParams.input !== undefined) rewrittenTx.input = data;
      const otherParams = request.params?.slice(1) ?? [];
      return deps.forwardToUpstream({ ...request, params: [rewrittenTx, ...otherParams] });
    } catch (error) {
      if (error instanceof InvalidRewriteRequestError) {
        return failure(request.id, { code: RpcErrorCode.InvalidParams, message: error.message });
      }
      return failure(request.id, mapSdkErrorToJsonRpc(error));
    }
  }

  deps.logger.debug(`Pass-through: ${request.method}`);
  return deps.forwardToUpstream(request);
}

export async function handleJsonRpc(
  body: unknown,
  deps: RouterDeps,
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  if (Array.isArray(body)) {
    return Promise.all(body.map((request) => handleSingleRequest(request, deps)));
  }
  return handleSingleRequest(body, deps);
}
