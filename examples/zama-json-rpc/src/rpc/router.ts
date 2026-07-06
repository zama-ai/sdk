import type { ZamaSDK } from "@zama-fhe/sdk";
import type { ConfidentialOperationRegistry } from "../registry/index.js";
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
  chainId: number;
  logger: Logger;
  forwardToUpstream: ReturnType<typeof createUpstreamForwarder>;
  zamaHandlers: Record<string, (rpcParams: unknown[]) => unknown>;
}

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

  if (request.method === "eth_sendTransaction") {
    const txParams = parseEthTransactionParams(request.params?.[0]);
    try {
      const { data } = await maybeRewriteTransaction({
        sdk: deps.sdk,
        registry: deps.registry,
        chainId: deps.chainId,
        tx: txParams,
        logger: deps.logger,
      });
      return deps.forwardToUpstream({ ...request, params: [{ ...txParams, data }] });
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
