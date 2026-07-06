import { describe, expect, it, vi } from "vitest";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { TokenValidityCache } from "../../src/registry/token-validity-cache.js";

const TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;

function fakeSdk(
  isConfidentialTokenValid: ZamaSDK["registry"]["isConfidentialTokenValid"],
): ZamaSDK {
  return { registry: { isConfidentialTokenValid } } as unknown as ZamaSDK;
}

describe("TokenValidityCache", () => {
  it("caches a positive result — the SDK is only called once for repeat lookups", async () => {
    const isConfidentialTokenValid = vi.fn().mockResolvedValue(true);
    const cache = new TokenValidityCache();
    const sdk = fakeSdk(isConfidentialTokenValid);

    expect(await cache.resolve(sdk, TOKEN)).toBe(true);
    expect(await cache.resolve(sdk, TOKEN)).toBe(true);
    expect(isConfidentialTokenValid).toHaveBeenCalledTimes(1);
  });

  it("caches a negative result too — this is the fix for the uncached-in-the-SDK finding", async () => {
    const isConfidentialTokenValid = vi.fn().mockResolvedValue(false);
    const cache = new TokenValidityCache();
    const sdk = fakeSdk(isConfidentialTokenValid);

    expect(await cache.resolve(sdk, TOKEN)).toBe(false);
    expect(await cache.resolve(sdk, TOKEN)).toBe(false);
    expect(isConfidentialTokenValid).toHaveBeenCalledTimes(1);
  });

  it("is case-insensitive on the address", async () => {
    const isConfidentialTokenValid = vi.fn().mockResolvedValue(true);
    const cache = new TokenValidityCache();
    const sdk = fakeSdk(isConfidentialTokenValid);

    await cache.resolve(sdk, TOKEN);
    await cache.resolve(sdk, TOKEN.toLowerCase() as typeof TOKEN);
    expect(isConfidentialTokenValid).toHaveBeenCalledTimes(1);
  });

  it("re-checks after the negative TTL expires", async () => {
    const isConfidentialTokenValid = vi.fn().mockResolvedValue(false);
    const cache = new TokenValidityCache({ negativeTtlMs: 1 });
    const sdk = fakeSdk(isConfidentialTokenValid);

    await cache.resolve(sdk, TOKEN);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await cache.resolve(sdk, TOKEN);

    expect(isConfidentialTokenValid).toHaveBeenCalledTimes(2);
  });
});
