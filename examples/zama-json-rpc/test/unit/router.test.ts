import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";
import { createLogger } from "../../src/logging/logger.js";
import { handleJsonRpc, handleSingleRequest, type RouterDeps } from "../../src/rpc/router.js";
import { success } from "../../src/rpc/jsonrpc.js";

const CHAIN_ID = 11155111;
const TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const FROM = "0x2222222222222222222222222222222222222222" as const;
const TO = "0x1111111111111111111111111111111111111111" as const;
const ENCRYPTED_VALUE =
  "0xdeadbeef00000000000000000000000000000000000000000000000000000000" as const;

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

function fakeMatchingSdk(): ZamaSDK {
  return {
    encrypt: vi
      .fn()
      .mockResolvedValue({ encryptedValues: [ENCRYPTED_VALUE], inputProof: "0xcafebabe" }),
    registry: { isConfidentialTokenValid: vi.fn().mockResolvedValue(true) },
  } as unknown as ZamaSDK;
}

function transferCalldata(amount = 10n): `0x${string}` {
  return encodeFunctionData({
    abi: confidentialTransferOperation({ chainId: CHAIN_ID }).publicAbi,
    functionName: "transfer",
    args: [TO, amount],
  });
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

  it("rewrites eth_call the same way as eth_sendTransaction, preserving the block tag", async () => {
    const forwardToUpstream = vi.fn().mockResolvedValue(success(1, "0x1"));
    const deps = makeDeps({ sdk: fakeMatchingSdk(), forwardToUpstream });
    const data = transferCalldata();
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "eth_call",
      params: [{ from: FROM, to: TOKEN, data }, "latest"],
    };

    await handleSingleRequest(request, deps);

    const forwarded = forwardToUpstream.mock.calls[0]?.[0];
    expect(forwarded.method).toBe("eth_call");
    expect(forwarded.params[0].data).not.toBe(data);
    expect(forwarded.params[1]).toBe("latest"); // block tag preserved
  });

  it("rewrites eth_estimateGas the same way", async () => {
    const forwardToUpstream = vi.fn().mockResolvedValue(success(1, "0x1"));
    const deps = makeDeps({ sdk: fakeMatchingSdk(), forwardToUpstream });
    const data = transferCalldata();
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "eth_estimateGas",
      params: [{ from: FROM, to: TOKEN, data }],
    };

    await handleSingleRequest(request, deps);

    const forwarded = forwardToUpstream.mock.calls[0]?.[0];
    expect(forwarded.method).toBe("eth_estimateGas");
    expect(forwarded.params[0].data).not.toBe(data);
  });

  it("accepts calldata under `input` and keeps `input`/`data` in sync after rewriting", async () => {
    const forwardToUpstream = vi.fn().mockResolvedValue(success(1, "0x1"));
    const deps = makeDeps({ sdk: fakeMatchingSdk(), forwardToUpstream });
    const data = transferCalldata();
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "eth_sendTransaction",
      params: [{ from: FROM, to: TOKEN, input: data }],
    };

    await handleSingleRequest(request, deps);

    const forwarded = forwardToUpstream.mock.calls[0]?.[0];
    expect(forwarded.params[0].data).not.toBe(data);
    expect(forwarded.params[0].input).toBe(forwarded.params[0].data);
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
