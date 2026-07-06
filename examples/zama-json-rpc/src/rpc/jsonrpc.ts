export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown[];
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JsonRpcError;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export function success(id: JsonRpcRequest["id"], result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: "2.0", id, result };
}

export function failure(id: JsonRpcRequest["id"], error: JsonRpcError): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error };
}

/** Standard JSON-RPC error codes used by this router. */
export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** Non-standard: used for upstream/SDK-side failures. */
  ServerError: -32000,
} as const;

export function isValidJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.jsonrpc === "2.0" &&
    typeof candidate.method === "string" &&
    (candidate.params === undefined || Array.isArray(candidate.params)) &&
    (typeof candidate.id === "string" ||
      typeof candidate.id === "number" ||
      candidate.id === null ||
      candidate.id === undefined)
  );
}
