import { describe, expect, it, vi } from "../../test-fixtures";
import type { Address } from "viem";

/**
 * Regression test for SDK-82: Token.decryptHandles must participate in the
 * shared DecryptCache so that subsequent sdk.userDecrypt calls for the same
 * (contract, handle) pair do not re-hit the relayer.
 */
describe("Token.decryptHandles shared cache participation (SDK-82)", () => {
  it("caches decrypted values so sdk.userDecrypt reuses them", async ({
    sdk,
    relayer,
    tokenAddress,
    handle,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 1000n } as never);

    const token = sdk.createToken(tokenAddress);

    const first = await token.decryptHandles([handle as Address]);
    expect(first.get(handle as Address)).toBe(1000n);
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);

    const second = await sdk.userDecrypt([{ handle, contractAddress: tokenAddress }]);
    expect(second[handle]).toBe(1000n);
    // The second call must be served from the cache written by decryptHandles —
    // no new relayer round-trip.
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);
  });

  it("serves cached values on repeated decryptHandles calls", async ({
    sdk,
    relayer,
    tokenAddress,
    handle,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 1000n } as never);

    const token = sdk.createToken(tokenAddress);

    await token.decryptHandles([handle as Address]);
    await token.decryptHandles([handle as Address]);

    // Second call must be a cache hit — only one relayer round-trip total.
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);
  });

  it("isolates cache entries by contract address — same handle bytes on different contracts hit the relayer separately", async ({
    sdk,
    relayer,
    handle,
  }) => {
    const tokenAddrA = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const tokenAddrB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ [handle]: 1000n } as never)
      .mockResolvedValueOnce({ [handle]: 2000n } as never);

    const tokenA = sdk.createToken(tokenAddrA);
    const tokenB = sdk.createToken(tokenAddrB);

    const resA = await tokenA.decryptHandles([handle as Address]);
    expect(resA.get(handle as Address)).toBe(1000n);

    // Same handle bytes, different contract — cache must NOT serve tokenA's
    // value here. The relayer is hit a second time and returns 2000n.
    const resB = await tokenB.decryptHandles([handle as Address]);
    expect(resB.get(handle as Address)).toBe(2000n);
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
  });
});
