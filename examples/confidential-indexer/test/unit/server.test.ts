import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { DelegationStore } from "../../src/indexer/delegation-store.js";
import { BalanceStore } from "../../src/indexer/balance-store.js";
import { TransferStore } from "../../src/indexer/transfer-store.js";
import { createInMemoryStore } from "../../src/storage/kv-store.js";
import { createLogger } from "../../src/logging/logger.js";
import { createHttpServer } from "../../src/server.js";

describe("createHttpServer — CORS", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const logger = createLogger({ quiet: true, verbose: false });
    server = createHttpServer({
      routerDeps: {
        delegationStore: new DelegationStore(createInMemoryStore()),
        balanceStore: new BalanceStore(createInMemoryStore()),
        transferStore: new TransferStore(createInMemoryStore()),
        apiKey: undefined,
      },
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
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("includes the CORS header on a normal GET response too", async () => {
    const response = await fetch(`${baseUrl}health`);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.status).toBe(200);
  });
});
