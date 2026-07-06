import { createServer, type Server } from "node:http";
import { handleRequest, type RouterDeps } from "./api/router.js";
import type { Logger } from "./logging/logger.js";

export function createHttpServer(params: { routerDeps: RouterDeps; logger: Logger }): Server {
  const { routerDeps, logger } = params;

  return createServer((req, res) => {
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
