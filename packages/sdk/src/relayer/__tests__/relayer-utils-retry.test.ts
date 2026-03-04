import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry } from "../relayer-utils";

beforeEach(() => {
  vi.useFakeTimers();
});

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("timed out")).mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries with exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
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

  it("throws immediately on non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("user denied"));
    await expect(withRetry(fn)).rejects.toThrow("user denied");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries on transient errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("502 bad gateway"));

    const promise = withRetry(fn);
    // Attach rejection handler immediately to avoid unhandled rejection
    const caught = promise.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await caught;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("502 bad gateway");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects custom retry count", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce("ok");

    const promise = withRetry(fn, 1);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-Error throws", async () => {
    const fn = vi.fn().mockRejectedValue("string error");
    await expect(withRetry(fn)).rejects.toBe("string error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on econnrefused", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("econnrefused")).mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
  });

  it("retries on socket hang up", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
  });

  it("retries on 504 gateway timeout", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("504 gateway timeout"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe("ok");
  });
});
