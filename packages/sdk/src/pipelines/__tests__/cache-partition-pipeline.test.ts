import { describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import type { Handle, ClearValueType } from "../../relayer/relayer-sdk.types";
import type { DecryptCache } from "../../decrypt-cache";
import { runCachePartitionPipeline } from "../cache-partition-pipeline";

const OWNER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const CONTRACT = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const HANDLE_1 = ("0x" + "01".repeat(32)) as Handle;
const HANDLE_2 = ("0x" + "02".repeat(32)) as Handle;
const HANDLE_3 = ("0x" + "03".repeat(32)) as Handle;

function createMockCache(store: Map<string, ClearValueType> = new Map()): DecryptCache {
  return {
    get: vi.fn((_owner: Address, contract: Address, handle: Handle) =>
      Promise.resolve(store.get(`${contract}:${handle}`) ?? null),
    ),
    set: vi.fn(() => Promise.resolve()),
  } as unknown as DecryptCache;
}

describe("runCachePartitionPipeline", () => {
  it("returns empty result/uncached for empty handles", async () => {
    const cache = createMockCache();
    const { result, uncached } = await runCachePartitionPipeline(
      { handles: [], ownerAddress: OWNER },
      { cache },
    );

    expect(result).toEqual({});
    expect(uncached).toEqual([]);
  });

  it("puts cached handles in result and uncached in uncached", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${getAddress(CONTRACT)}:${HANDLE_1}`, 100n);

    const cache = createMockCache(store);
    const { result, uncached } = await runCachePartitionPipeline(
      {
        handles: [
          { handle: HANDLE_1, contractAddress: CONTRACT },
          { handle: HANDLE_2, contractAddress: CONTRACT },
        ],
        ownerAddress: OWNER,
      },
      { cache },
    );

    expect(result[HANDLE_1]).toBe(100n);
    expect(Object.keys(result)).toHaveLength(1);
    expect(uncached).toEqual([{ handle: HANDLE_2, contractAddress: getAddress(CONTRACT) }]);
  });

  it("normalises contract addresses via getAddress", async () => {
    const lowercaseContract = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const store = new Map<string, ClearValueType>();
    store.set(`${getAddress(lowercaseContract)}:${HANDLE_1}`, 42n);

    const cache = createMockCache(store);
    const { result, uncached } = await runCachePartitionPipeline(
      {
        handles: [{ handle: HANDLE_1, contractAddress: lowercaseContract }],
        ownerAddress: OWNER,
      },
      { cache },
    );

    expect(result[HANDLE_1]).toBe(42n);
    expect(uncached).toHaveLength(0);
  });

  it("returns all handles as uncached when cache is empty", async () => {
    const cache = createMockCache();
    const handles = [
      { handle: HANDLE_1, contractAddress: CONTRACT },
      { handle: HANDLE_2, contractAddress: CONTRACT },
      { handle: HANDLE_3, contractAddress: CONTRACT },
    ];
    const { result, uncached } = await runCachePartitionPipeline(
      { handles, ownerAddress: OWNER },
      { cache },
    );

    expect(Object.keys(result)).toHaveLength(0);
    expect(uncached).toHaveLength(3);
  });

  it("returns all handles as cached when all are in cache", async () => {
    const store = new Map<string, ClearValueType>();
    const norm = getAddress(CONTRACT);
    store.set(`${norm}:${HANDLE_1}`, 10n);
    store.set(`${norm}:${HANDLE_2}`, 20n);

    const cache = createMockCache(store);
    const { result, uncached } = await runCachePartitionPipeline(
      {
        handles: [
          { handle: HANDLE_1, contractAddress: CONTRACT },
          { handle: HANDLE_2, contractAddress: CONTRACT },
        ],
        ownerAddress: OWNER,
      },
      { cache },
    );

    expect(result[HANDLE_1]).toBe(10n);
    expect(result[HANDLE_2]).toBe(20n);
    expect(uncached).toHaveLength(0);
  });
});
