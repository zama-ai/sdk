import { describe, test, expect, vi, beforeEach } from "../../test-fixtures";
import { withRetry } from "../relayer-utils";

beforeEach(() => {
  vi.useFakeTimers();
});

describe("withRetry", () => {
  test("returns immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // A relayer gateway transient (502/503/504) is tagged by the relayer SDK.
  const relayerGateway = (status: number) =>
    Object.assign(new Error(`relayer respond with HTTP code ${status}`), {
      cause: { code: "RELAYER_FETCH_ERROR", status },
    });

  test("retries on a relayer transport error and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("retries with exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(relayerGateway(503))
      .mockRejectedValueOnce(new Error("econnreset"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    // First retry at 500ms
    await vi.advanceTimersByTimeAsync(500);
    // Second retry at 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws immediately on non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("user denied"));
    await expect(withRetry(fn)).rejects.toThrow("user denied");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("throws after exhausting retries on transient errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("502 bad gateway"));

    const promise = withRetry(fn);
    // Attach rejection handler immediately to avoid unhandled rejection
    const caught = promise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await caught;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("502 bad gateway");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("respects custom retry count", async () => {
    const fn = vi.fn().mockRejectedValueOnce(relayerGateway(503)).mockResolvedValueOnce("ok");

    const promise = withRetry(fn, 1);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does not retry non-Error throws", async () => {
    const fn = vi.fn().mockRejectedValue("string error");
    await expect(withRetry(fn)).rejects.toBe("string error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on econnrefused", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("econnrefused")).mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
  });

  test("retries on socket hang up", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
  });

  test("retries on a relayer 504 gateway timeout (tagged)", async () => {
    const fn = vi.fn().mockRejectedValueOnce(relayerGateway(504)).mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
  });

  test("does NOT retry a consumer-RPC fault — defers to the integrator's viem/ethers client", async () => {
    // The worker's ACL read goes through the consumer's viem/ethers client, which
    // already retries transport faults; a viem TimeoutError must not be retried again.
    const viemTimeout = Object.assign(new Error("The request timed out."), {
      name: "TimeoutError",
    });
    const fn = vi.fn().mockRejectedValue(viemTimeout);
    await expect(withRetry(fn)).rejects.toBe(viemTimeout);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("does NOT retry a bare timeout (owned by viem/ethers + the worker-level timeout)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Request timed out after 30000ms"));
    await expect(withRetry(fn)).rejects.toThrow(/timed out/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("does NOT retry relayer back-pressure (429) — surfaced with retryAfter instead", async () => {
    const relayer429 = Object.assign(new Error("Relayer rate limit exceeded"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
    });
    const fn = vi.fn().mockRejectedValue(relayer429);
    await expect(withRetry(fn)).rejects.toBe(relayer429);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
