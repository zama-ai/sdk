import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { TokenValidityCache } from "../../src/registry/token-validity-cache.js";
import { createLogger } from "../../src/logging/logger.js";
import { AuditBuffer } from "../../src/logging/audit-buffer.js";
import { success } from "../../src/rpc/jsonrpc.js";
import { createHttpServer } from "../../src/server.js";

function fakeRouterDeps(logger: ReturnType<typeof createLogger>) {
  return {
    sdk: {} as unknown as ZamaSDK,
    registry: new ConfidentialOperationRegistry([]),
    tokenValidityCache: new TokenValidityCache(),
    chainId: 11155111,
    logger,
    forwardToUpstream: async (request: { id: string | number | null }) =>
      success(request.id, "0xok"),
    zamaHandlers: {},
  };
}

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

describe("createHttpServer — GET /audit", () => {
  let server: Server;
  let baseUrl: string;
  const auditBuffer = new AuditBuffer();

  beforeAll(async () => {
    const logger = createLogger({ quiet: true, verbose: false, auditBuffer });
    auditBuffer.push({
      decision: "rewritten",
      method: "eth_sendTransaction",
      contractAddress: "0xabc",
      operation: "confidentialTransfer",
    });
    server = createHttpServer({
      routerDeps: fakeRouterDeps(logger),
      httpPath: "/",
      apiKey: undefined,
      logger,
      auditBuffer,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves the buffer's entries as JSON", async () => {
    const response = await fetch(`${baseUrl}/audit`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].entry.operation).toBe("confidentialTransfer");
  });

  it("rejects GET /audit when an apiKey is configured and missing", async () => {
    const logger = createLogger({ quiet: true, verbose: false, auditBuffer });
    const gatedServer = createHttpServer({
      routerDeps: fakeRouterDeps(logger),
      httpPath: "/",
      apiKey: "secret",
      logger,
      auditBuffer,
    });
    await new Promise<void>((resolve) => gatedServer.listen(0, "127.0.0.1", () => resolve()));
    const { port } = gatedServer.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/audit`);
    expect(response.status).toBe(401);

    await new Promise<void>((resolve) => gatedServer.close(() => resolve()));
  });
});
