import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { TokenValidityCache } from "../../src/registry/token-validity-cache.js";
import { createLogger } from "../../src/logging/logger.js";
import { success } from "../../src/rpc/jsonrpc.js";
import { createHttpServer } from "../../src/server.js";

describe("createHttpServer — CORS", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const logger = createLogger({ quiet: true, verbose: false });
    server = createHttpServer({
      routerDeps: {
        sdk: {} as unknown as ZamaSDK,
        registry: new ConfidentialOperationRegistry([]),
        tokenValidityCache: new TokenValidityCache(),
        chainId: 11155111,
        logger,
        forwardToUpstream: async (request) => success(request.id, "0xok"),
        zamaHandlers: {},
      },
      httpPath: "/",
      apiKey: undefined,
      logger,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers an OPTIONS preflight with 204 and permissive CORS headers", async () => {
    const response = await fetch(baseUrl, { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("includes the CORS header on a normal POST response too", async () => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.status).toBe(200);
  });
});
