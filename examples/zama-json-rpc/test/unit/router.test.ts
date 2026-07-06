import { describe, expect, it, vi } from "vitest";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";
import { createLogger } from "../../src/logging/logger.js";
import { handleJsonRpc, handleSingleRequest, type RouterDeps } from "../../src/rpc/router.js";
import { success } from "../../src/rpc/jsonrpc.js";

const CHAIN_ID = 11155111;

function makeDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    sdk: {} as unknown as ZamaSDK,
    registry: new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID }),
    ]),
    chainId: CHAIN_ID,
    logger: createLogger({ quiet: true, verbose: false }),
    forwardToUpstream: vi.fn().mockResolvedValue(success(1, "0xupstream")),
    zamaHandlers: {},
    ...overrides,
  };
}

describe("handleSingleRequest", () => {
  it("rejects malformed requests", async () => {
    const response = await handleSingleRequest({ not: "a request" }, makeDeps());
    expect("error" in response && response.error.code).toBe(-32600);
  });

  it("invokes a registered zama_* handler", async () => {
    const deps = makeDeps({ zamaHandlers: { zama_getCapabilities: () => ({ ok: true }) } });
    const response = await handleSingleRequest(
      { jsonrpc: "2.0", id: 1, method: "zama_getCapabilities", params: [] },
      deps,
    );
    expect("result" in response && response.result).toEqual({ ok: true });
  });

  it("rejects an unregistered zama_* method", async () => {
    const response = await handleSingleRequest(
      { jsonrpc: "2.0", id: 1, method: "zama_notARealMethod", params: [] },
      makeDeps(),
    );
    expect("error" in response && response.error.code).toBe(-32601);
  });

  it("passes through a non-matching eth_sendTransaction unchanged", async () => {
    const forwardToUpstream = vi.fn().mockResolvedValue(success(1, "0xhash"));
    const deps = makeDeps({ forwardToUpstream });
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "eth_sendTransaction",
      params: [
        { from: "0xabc", to: "0x0000000000000000000000000000000000dEaD", data: "0x12345678" },
      ],
    };

    await handleSingleRequest(request, deps);

    expect(forwardToUpstream).toHaveBeenCalledTimes(1);
    const forwarded = forwardToUpstream.mock.calls[0]?.[0];
    expect(forwarded.params[0].data).toBe("0x12345678");
  });

  it("passes through generic methods unchanged", async () => {
    const forwardToUpstream = vi.fn().mockResolvedValue(success(1, "0x1"));
    const deps = makeDeps({ forwardToUpstream });
    const request = { jsonrpc: "2.0" as const, id: 1, method: "eth_blockNumber", params: [] };

    await handleSingleRequest(request, deps);

    expect(forwardToUpstream).toHaveBeenCalledWith(request);
  });
});

describe("handleJsonRpc", () => {
  it("handles batch requests", async () => {
    const deps = makeDeps({ zamaHandlers: { zama_getCapabilities: () => ({ ok: true }) } });
    const result = await handleJsonRpc(
      [
        { jsonrpc: "2.0", id: 1, method: "zama_getCapabilities", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
      ],
      deps,
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});
