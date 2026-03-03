import { describe, it, expect, vi } from "vitest";
import { CleartextExecutor } from "../cleartext-executor";

const HANDLE = "0x" + "ab".repeat(32);

describe("CleartextExecutor", () => {
  it("reads a single plaintext", async () => {
    const mockContract = { plaintexts: vi.fn().mockResolvedValue(42n) };
    const executor = new CleartextExecutor(mockContract as never);
    const result = await executor.getPlaintext(HANDLE);
    expect(result).toBe(42n);
    expect(mockContract.plaintexts).toHaveBeenCalledWith(HANDLE);
  });

  it("reads multiple plaintexts", async () => {
    const handle2 = "0x" + "cd".repeat(32);
    const mockContract = {
      plaintexts: vi.fn().mockResolvedValueOnce(42n).mockResolvedValueOnce(100n),
    };
    const executor = new CleartextExecutor(mockContract as never);
    const result = await executor.getPlaintexts([HANDLE, handle2]);
    expect(result).toEqual([42n, 100n]);
  });
});
