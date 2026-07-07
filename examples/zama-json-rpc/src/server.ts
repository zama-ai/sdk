import { createServer, type Server } from "node:http";
import { handleJsonRpc, type RouterDeps } from "./rpc/router.js";
import { RpcErrorCode, failure } from "./rpc/jsonrpc.js";
import { isAuthorized } from "./rpc/auth.js";
import type { Logger } from "./logging/logger.js";
import type { AuditBuffer } from "./logging/audit-buffer.js";

const MAX_BODY_BYTES = 1_000_000;
const AUDIT_PATH = "/audit";

/**
 * Permissive, dev-only CORS: lets a local browser app (e.g. `examples/rpc-demo-app`)
 * call this server directly from a different origin/port. Not something to expose
 * as-is beyond local development — same posture as the `0.0.0.0` bind warning.
 */
function setCorsHeaders(res: import("node:http").ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
}

export function createHttpServer(params: {
  routerDeps: RouterDeps;
  httpPath: string;
  apiKey: string | undefined;
  logger: Logger;
  /** If provided, GET /audit serves its contents — see logging/audit-buffer.ts. */
  auditBuffer?: AuditBuffer;
}): Server {
  const { routerDeps, httpPath, apiKey, logger, auditBuffer } = params;

  return createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS" && (req.url === httpPath || req.url === AUDIT_PATH)) {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === AUDIT_PATH) {
      if (!isAuthorized(req, apiKey)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ entries: auditBuffer?.list() ?? [] }));
      return;
    }

    if (req.method !== "POST" || req.url !== httpPath) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    if (!isAuthorized(req, apiKey)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify(failure(null, { code: RpcErrorCode.ServerError, message: "Unauthorized" })),
      );
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Payload Too Large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      void (async () => {
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const result = await handleJsonRpc(parsed, routerDeps);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          logger.error(
            `Failed to handle request: ${error instanceof Error ? error.message : String(error)}`,
          );
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify(
              failure(null, { code: RpcErrorCode.ParseError, message: "Parse error" }),
            ),
          );
        }
      })();
    });
  });
}
