import { describe, expect, test } from "vitest";
import { fromWireError, isWireError, toWireError } from "../protocol";
import type { WireInitPayload } from "../protocol";

describe("isWireError", () => {
  test("recognizes wire errors and only wire errors", () => {
    expect(isWireError(toWireError(new Error("boom")))).toBe(true);
    expect(isWireError(new Error("boom"))).toBe(false);
    expect(isWireError({ name: "Error", message: "boom" })).toBe(false);
    expect(isWireError(null)).toBe(false);
  });

  test("rejects a value merely carrying the marker key", () => {
    expect(isWireError({ wireError: false })).toBe(false);
    expect(isWireError({ wireError: undefined })).toBe(false);
    expect(isWireError(Object.assign(new Error("boom"), { wireError: false }))).toBe(false);
  });
});

describe("toWireError / fromWireError", () => {
  test("wire errors survive structured clone with their classifier fields", () => {
    const thrown = Object.assign(new Error("rate limited"), { statusCode: 429, retryAfter: 7 });
    thrown.name = "RelayerResponseStatusError";

    const crossed = structuredClone(toWireError(thrown));

    expect(isWireError(crossed)).toBe(true);
    expect(fromWireError(crossed)).toMatchObject({
      name: "RelayerResponseStatusError",
      message: "rate limited",
      statusCode: 429,
      retryAfter: 7,
    });
  });

  test("toWireError is idempotent on already-flattened errors", () => {
    const wire = toWireError(new Error("boom"));
    expect(toWireError(wire)).toBe(wire);
  });

  test("round-trips name, message, and stack", () => {
    const original = new Error("boom");
    original.name = "RelayerTimeoutError";

    const revived = fromWireError(toWireError(original));

    expect(revived.name).toBe("RelayerTimeoutError");
    expect(revived.message).toBe("boom");
    expect(revived.stack).toBe(original.stack);
  });

  test("preserves the own fields the error classifiers read", () => {
    const original = Object.assign(new Error("rate limited"), {
      statusCode: 429,
      retryAfter: 12,
      relayerApiError: { label: "throttled", message: "slow down" },
    });

    const revived = fromWireError(toWireError(original)) as Error & Record<string, unknown>;

    expect(revived["statusCode"]).toBe(429);
    expect(revived["retryAfter"]).toBe(12);
    expect(revived["relayerApiError"]).toEqual({ label: "throttled", message: "slow down" });
  });

  test("drops non-cloneable fields instead of failing", () => {
    const original = Object.assign(new Error("with response"), {
      data: { nested: () => "function" },
    });

    const wire = toWireError(original);

    expect(wire.props["data"]).toBeUndefined();
  });

  test("extracts a numeric Retry-After header from an attached response", () => {
    const original = Object.assign(new Error("throttled"), {
      response: { headers: new Headers({ "Retry-After": "7" }) },
    });

    const revived = fromWireError(toWireError(original)) as Error & { retryAfter?: number };

    expect(revived.retryAfter).toBe(7);
  });

  test("extracts an HTTP-date Retry-After header as seconds from now", () => {
    const original = Object.assign(new Error("throttled"), {
      response: {
        headers: new Headers({ "Retry-After": new Date(Date.now() + 30_000).toUTCString() }),
      },
    });

    const revived = fromWireError(toWireError(original)) as Error & { retryAfter?: number };

    // toUTCString drops the milliseconds, so the parsed delta rounds to 29 or 30.
    expect(revived.retryAfter).toBeGreaterThanOrEqual(29);
    expect(revived.retryAfter).toBeLessThanOrEqual(30);
  });

  test("round-trips the cause chain", () => {
    const root = Object.assign(new Error("root"), { status: 503 });
    root.name = "RelayerResponseStatusError";
    const original = new Error("wrapper", { cause: root });

    const revived = fromWireError(toWireError(original));

    const cause = revived.cause as Error & { status?: number };
    expect(cause.name).toBe("RelayerResponseStatusError");
    expect(cause.status).toBe(503);
  });

  test("caps cause recursion depth", () => {
    let error = new Error("leaf");
    for (let i = 0; i < 10; i++) {
      error = new Error(`layer ${i}`, { cause: error });
    }

    let wire = toWireError(error);
    let depth = 0;
    while (wire.cause !== undefined) {
      wire = wire.cause;
      depth += 1;
    }
    expect(depth).toBe(6);
  });

  test("wraps non-Error values", () => {
    const revived = fromWireError(toWireError("plain string"));
    expect(revived).toBeInstanceOf(Error);
    expect(revived.message).toBe("plain string");
  });

  test("wraps a thrown bigint in its string form", () => {
    const wire = toWireError(42n);

    expect(wire.message).toBe("42");
    expect(fromWireError(wire).message).toBe("42");
  });

  test("wraps a thrown circular object in its string form", () => {
    const circular: Record<string, unknown> = { label: "boom" };
    circular["self"] = circular;

    const wire = toWireError(circular);

    expect(wire.message).toBe("[object Object]");
    expect(fromWireError(wire).message).toBe("[object Object]");
  });

  test("keeps a circular data field, which structured clone preserves", () => {
    const circular: Record<string, unknown> = { label: "boom" };
    circular["self"] = circular;
    const original = Object.assign(new Error("with circular data"), { data: circular });

    const wire = toWireError(original);
    const crossed = structuredClone(wire);

    expect((crossed.props["data"] as Record<string, unknown>)["label"]).toBe("boom");
    expect((crossed.props["data"] as Record<string, unknown>)["self"]).toBe(crossed.props["data"]);
  });

  test("keeps the classifier fields a prototype getter exposes", () => {
    // Upstream's relayer errors expose `status` and `relayerApiError` as
    // prototype getters, so the extraction must not be own-property-only.
    class RelayerResponseApiError extends Error {
      override readonly name = "RelayerResponseApiError";
      get status(): number {
        return 429;
      }
      get relayerApiError(): { label: string } {
        return { label: "throttled" };
      }
    }

    const wire = toWireError(new RelayerResponseApiError("api error"));

    expect(wire.props["status"]).toBe(429);
    expect(wire.props["relayerApiError"]).toEqual({ label: "throttled" });
  });

  test("keeps the code of a plain object rejection, as wallets throw", () => {
    const wire = structuredClone(toWireError({ code: -32005, message: "rate limited" }));

    const revived = fromWireError(wire) as Error & { code?: number };
    expect(revived.message).toBe("rate limited");
    expect(revived.code).toBe(-32005);
  });

  test("keeps code, data, and cause of a plain object rejection", () => {
    const rejection = {
      code: 4001,
      message: "User rejected the request.",
      data: { reason: "denied" },
      cause: { code: -32000, message: "inner" },
    };

    const revived = structuredClone(toWireError(rejection));

    expect(fromWireError(revived)).toMatchObject({
      message: "User rejected the request.",
      code: 4001,
      data: { reason: "denied" },
      cause: { message: "inner", code: -32000 },
    });
  });

  test("prefers a valid Retry-After header over a malformed own retryAfter", () => {
    const original = Object.assign(new Error("throttled"), {
      retryAfter: -1,
      response: { headers: new Headers({ "Retry-After": "9" }) },
    });

    const revived = fromWireError(toWireError(original)) as Error & { retryAfter?: number };

    expect(revived.retryAfter).toBe(9);
  });

  test("round-trips the nested error keys the classifiers walk", () => {
    const original = Object.assign(new Error("server response"), {
      info: { responseStatus: "429 Too Many Requests" },
    });

    const revived = fromWireError(toWireError(original)) as Error & {
      info?: { responseStatus?: string };
    };

    expect(revived.info?.responseStatus).toBe("429 Too Many Requests");
  });

  test("drops an object structured clone rejects even with no enumerable fields", () => {
    const original = Object.assign(new Error("with a weakmap"), { data: new WeakMap() });

    const wire = toWireError(original);

    expect(wire.props["data"]).toBeUndefined();
  });
});

/**
 * Shaped like what the worker client actually sends: the upstream chain shape
 * for `chain`, `WireRuntimeConfig`'s picked fields for `runtime`, and a
 * `clientOptions.fheEncryptionKey` with the `Uint8Array`-backed
 * `FheEncryptionKeyBytes` shape `fetchFheEncryptionKeyBytes` resolves to.
 */
function realisticInitPayload(): WireInitPayload {
  return {
    chain: {
      id: 11155111,
      fhevm: {
        contracts: {
          acl: { address: "0x1111111111111111111111111111111111111a" },
          inputVerifier: { address: "0x2222222222222222222222222222222222222b" },
          kmsVerifier: { address: "0x3333333333333333333333333333333333333c" },
          protocolConfig: undefined,
        },
        relayerUrl: "https://relayer.example",
        gateway: {
          id: 55,
          contracts: {
            decryption: { address: "0x4444444444444444444444444444444444444d" },
            inputVerification: { address: "0x5555555555555555555555555555555555555e" },
          },
        },
      },
    } as unknown as WireInitPayload["chain"],
    rpcUrl: "https://rpc.example/v1",
    clientOptions: {
      batchRpcCalls: true,
      moduleVersions: "auto",
      fheEncryptionKey: {
        publicKeyBytes: { id: "pk-1", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
        crsBytes: { id: "crs-1", capacity: 2048, bytes: new Uint8Array([6, 7, 8, 9]) },
        metadata: { relayerUrl: "https://relayer.example", chainId: 11155111 },
      },
    } as unknown as WireInitPayload["clientOptions"],
    runtime: {
      wasmAssetLoadMode: "auto",
      singleThread: false,
      numberOfThreads: 4,
      moduleVersions: "auto",
      auth: { __type: "ApiKeyHeader", value: "test-key" },
    } as unknown as WireInitPayload["runtime"],
  };
}

/**
 * Plain-data view of a payload: a whole-object `toEqual` chokes on the
 * cross-realm `Uint8Array` structuredClone hands back under happy-dom.
 */
function normalize(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) =>
      ArrayBuffer.isView(entry) ? Array.from(entry as unknown as Uint8Array) : entry,
    ),
  );
}

describe("structuredClone of the real wire payloads", () => {
  test("a realistic WireInitPayload survives structuredClone intact", () => {
    const payload = realisticInitPayload();

    const cloned = structuredClone(payload);

    expect(normalize(cloned)).toEqual(normalize(payload));
    // The key bytes still need a structural check: normalizing turns them into
    // arrays, which says nothing about the view type surviving the clone.
    expect(cloned.clientOptions.fheEncryptionKey).toBeDefined();
    const key = (
      cloned.clientOptions as { fheEncryptionKey: { publicKeyBytes: { bytes: Uint8Array } } }
    ).fheEncryptionKey;
    expect(key.publicKeyBytes.bytes.constructor.name).toBe("Uint8Array");
    expect(Array.from(key.publicKeyBytes.bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  test("an undefined rpcUrl (injected-provider network) survives structuredClone", () => {
    const payload = { ...realisticInitPayload(), rpcUrl: undefined };

    const cloned = structuredClone(payload);

    expect(cloned.rpcUrl).toBeUndefined();
  });

  test("a realistic encryptValue wire parameter object survives structuredClone", () => {
    const parameters = {
      value: { type: "euint64", value: 42n },
      contractAddress: "0xc0ffee0000000000000000000000000000c0fe",
      userAddress: "0xbeef000000000000000000000000000000beef",
      options: {
        auth: { __type: "BearerToken", token: "test-token" },
        headers: { "x-request-id": "abc-123" },
        debug: false,
        fetchRetries: 3,
        fetchRetryDelayInMilliseconds: 1_000,
        timeout: 60_000,
      },
    };

    const cloned = structuredClone(parameters);

    expect(cloned).toEqual(parameters);
    expect(cloned.value.value).toBe(42n);
    expect(typeof cloned.value.value).toBe("bigint");
  });

  test("a realistic encryptValues wire parameter object survives structuredClone", () => {
    const parameters = {
      values: [
        { type: "euint64", value: 1_000_000_000_000n },
        { type: "ebool", value: true },
        { type: "eaddress", value: "0xbeef000000000000000000000000000000beef" },
      ],
      contractAddress: "0xc0ffee0000000000000000000000000000c0fe",
      userAddress: "0xbeef000000000000000000000000000000beef",
      options: undefined,
    };

    const cloned = structuredClone(parameters);

    expect(cloned).toEqual(parameters);
    expect(cloned.values[0]!.value).toBe(1_000_000_000_000n);
    expect(cloned.values[1]!.value).toBe(true);
  });
});
