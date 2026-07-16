import { getAddress, type Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import type { GenericStorage } from "../../types";
import { DecryptCache } from "../decrypt-cache";
import { LoggerService } from "../logger-service";

const REQUESTER = getAddress("0x1111111111111111111111111111111111111111") as Address;
const CONTRACT = getAddress("0x2222222222222222222222222222222222222222") as Address;
const HANDLE = "0xabc" as const;

function throwingStorage(): GenericStorage {
  return {
    get: vi.fn(() => Promise.reject(new Error("storage down"))),
    set: vi.fn(() => Promise.reject(new Error("storage down"))),
    delete: vi.fn(() => Promise.reject(new Error("storage down"))),
  } as unknown as GenericStorage;
}

describe("DecryptCache logging", () => {
  test("a failed read is swallowed and produces no console output with a silent logger", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cache = new DecryptCache(throwingStorage(), new LoggerService());
      await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("a failed read routes through the injected logger at warn, with the [zama-sdk] prefix", async () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const cache = new DecryptCache(throwingStorage(), new LoggerService(sink));
    await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
    expect(sink.warn).toHaveBeenCalledOnce();
    expect(sink.warn.mock.calls[0]![0]).toMatch(/^\[zama-sdk\] /);
    expect(sink.error).not.toHaveBeenCalled();
  });
});
