import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpstreamForwarder } from "../../src/rpc/passthrough.js";

describe("createUpstreamForwarder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the request body unchanged and returns the upstream response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: "0x1" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const forward = createUpstreamForwarder("https://rpc.example");
    const request = { jsonrpc: "2.0" as const, id: 1, method: "eth_blockNumber", params: [] };
    const response = await forward(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://rpc.example",
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
    expect(response).toEqual({ jsonrpc: "2.0", id: 1, result: "0x1" });
  });

  it("returns a JSON-RPC error when the upstream responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: "Bad Gateway" }),
    );

    const forward = createUpstreamForwarder("https://rpc.example");
    const response = await forward({
      jsonrpc: "2.0",
      id: 9,
      method: "eth_blockNumber",
      params: [],
    });

    expect("error" in response && response.error.message).toBe("Upstream RPC returned HTTP 502");
    expect("error" in response && response.id).toBe(9);
  });

  it("returns a JSON-RPC error when the upstream is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const forward = createUpstreamForwarder("https://rpc.example");
    const response = await forward({
      jsonrpc: "2.0",
      id: 7,
      method: "eth_blockNumber",
      params: [],
    });

    expect("error" in response && response.error.message).toBe("Failed to reach upstream RPC");
    expect("error" in response && response.id).toBe(7);
  });
});
