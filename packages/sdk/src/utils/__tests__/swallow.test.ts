import { describe, test, expect, vi } from "../../test-fixtures";
import { LoggerService } from "../../services/logger-service";
import { swallow } from "../swallow";

describe("swallow", () => {
  // The SDK-wide logger is always supplied; a LoggerService with no inner
  // sink is the silent-by-default case.
  const silent = new LoggerService();

  test("runs the function and resolves when it succeeds", async () => {
    const fn = vi.fn(() => Promise.resolve());
    await swallow("op", fn, silent);
    expect(fn).toHaveBeenCalledOnce();
  });

  test("swallows a thrown error without rejecting", async () => {
    await expect(
      swallow(
        "op",
        () => {
          throw new Error("boom");
        },
        silent,
      ),
    ).resolves.toBeUndefined();
  });

  test("emits no console output with a silent logger", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await swallow(
        "op",
        () => {
          throw new Error("boom");
        },
        silent,
      );
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test("routes a swallowed error through the injected logger at warn", async () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const cause = new Error("boom");
    await swallow(
      "persist permit",
      () => {
        throw cause;
      },
      new LoggerService(sink),
    );
    expect(sink.warn).toHaveBeenCalledOnce();
    const [message] = sink.warn.mock.calls[0];
    expect(message).toContain("persist permit");
    expect(sink.error).not.toHaveBeenCalled();
  });
});
