import { getAddress } from "viem";
import { vi } from "vitest";
import { describe, expect, test } from "../../test-fixtures";
import { memoizeAddressRead } from "../memoize-address-read";

const ADDRESS = getAddress("0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a");

describe("memoizeAddressRead", () => {
  test("reads once and answers every later call from the cache", async () => {
    const read = vi.fn().mockResolvedValue(ADDRESS);
    const memoized = memoizeAddressRead(read);

    await expect(memoized()).resolves.toBe(ADDRESS);
    await expect(memoized()).resolves.toBe(ADDRESS);

    expect(read).toHaveBeenCalledTimes(1);
  });

  test("shares one in-flight read between concurrent callers", async () => {
    const read = vi.fn().mockResolvedValue(ADDRESS);
    const memoized = memoizeAddressRead(read);

    await expect(Promise.all([memoized(), memoized()])).resolves.toStrictEqual([ADDRESS, ADDRESS]);

    expect(read).toHaveBeenCalledTimes(1);
  });

  test("does not cache a rejected read, so the next call tries again", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("rpc down")).mockResolvedValue(ADDRESS);
    const memoized = memoizeAddressRead(read);

    await expect(memoized()).rejects.toThrow("rpc down");
    await expect(memoized()).resolves.toBe(ADDRESS);

    expect(read).toHaveBeenCalledTimes(2);
  });
});
