import { createServer, type Server } from "node:http";
import { handleRequest, type RouterDeps } from "./api/router.js";
import type { Logger } from "./logging/logger.js";

/**
 * Permissive, dev-only CORS: lets a local browser app (e.g. `examples/rpc-demo-app`)
 * query this REST API directly cross-origin. Not something to expose as-is beyond
 * local development.
 */
function setCorsHeaders(res: import("node:http").ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization");
}

export function createHttpServer(params: { routerDeps: RouterDeps; logger: Logger }): Server {
  const { routerDeps, logger } = params;

  return createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const authHeader = req.headers.authorization;
        const result = await handleRequest(
          {
            method: req.method ?? "GET",
            path: url.pathname,
            headers: { authorization: Array.isArray(authHeader) ? authHeader[0] : authHeader },
          },
          routerDeps,
        );
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(JSON.stringify(result.body));
      } catch (error) {
        logger.error(
          `Unhandled request error: ${error instanceof Error ? error.message : String(error)}`,
        );
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    })();
  });
}
