import { describe, expect, it } from "vitest";
import { ConfigurationError, RelayerRequestFailedError, RpcRateLimitError } from "@zama-fhe/sdk";
import { mapSdkErrorToJsonRpc } from "../../src/rpc/errors.js";

describe("mapSdkErrorToJsonRpc", () => {
  it("propagates retryable/retryAfter for relayer back-pressure (429)", () => {
    const error = new RelayerRequestFailedError("rate limited", 429, { retryAfter: 30 });
    const mapped = mapSdkErrorToJsonRpc(error);

    expect(mapped.data).toMatchObject({ statusCode: 429, retryable: true, retryAfter: 30 });
  });

  it("propagates retryAfter for upstream RPC rate-limiting too, not just the relayer's", () => {
    const error = new RpcRateLimitError("rpc rate limited", { retryAfter: 5 });
    const mapped = mapSdkErrorToJsonRpc(error);

    expect(mapped.data).toMatchObject({ retryable: true, retryAfter: 5 });
  });

  it("maps ConfigurationError to an internal error", () => {
    const mapped = mapSdkErrorToJsonRpc(new ConfigurationError("bad config"));
    expect(mapped.code).toBe(-32603);
  });

  it("falls back to a generic Zama SDK error for non-ZamaError values", () => {
    const mapped = mapSdkErrorToJsonRpc(new Error("boom"));
    expect(mapped.message).toBe("Zama SDK error");
    expect(mapped.data).toMatchObject({ reason: "boom" });
  });
});
