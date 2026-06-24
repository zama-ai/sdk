import { describe, expect, test, vi } from "../../test-fixtures";
import { LoggerService } from "../logger-service";

describe("LoggerService", () => {
  test("delegates every level to the wrapped logger, prefixed with [zama-sdk]", () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const logger = new LoggerService(sink);

    logger.error("e", { a: 1 });
    logger.warn("w");
    logger.info("i");
    logger.debug("d");

    expect(sink.error).toHaveBeenCalledWith("[zama-sdk] e", { a: 1 });
    expect(sink.warn).toHaveBeenCalledWith("[zama-sdk] w", undefined);
    expect(sink.info).toHaveBeenCalledWith("[zama-sdk] i", undefined);
    expect(sink.debug).toHaveBeenCalledWith("[zama-sdk] d", undefined);
  });

  test("is a no-op (never throws) when constructed without a logger", () => {
    const logger = new LoggerService();
    expect(() => {
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");
    }).not.toThrow();
  });

  test("exposes a consistent shape regardless of whether a logger is supplied", () => {
    for (const logger of [
      new LoggerService(),
      new LoggerService({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    ]) {
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
    }
  });
});
