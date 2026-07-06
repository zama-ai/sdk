import { createServer, type Server } from "node:http";
import { handleJsonRpc, type RouterDeps } from "./rpc/router.js";
import { RpcErrorCode, failure } from "./rpc/jsonrpc.js";
import { isAuthorized } from "./rpc/auth.js";
import type { Logger } from "./logging/logger.js";

const MAX_BODY_BYTES = 1_000_000;

export function createHttpServer(params: {
  routerDeps: RouterDeps;
  httpPath: string;
  apiKey: string | undefined;
  logger: Logger;
}): Server {
  const { routerDeps, httpPath, apiKey, logger } = params;

  return createServer((req, res) => {
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
