import type { Address } from "viem";
import { describe, expect, mockCurrentBatchIds, test } from "../../test-fixtures";
import {
  normalizeBatcherHistory,
  resolveActiveBatcher,
  type BatcherHistory,
} from "../batcher-history";
import { vaultQueryKeys } from "../query/query-keys";

const OLDEST = "0x1111111111111111111111111111111111111111" as Address;
const OLDER = "0x2222222222222222222222222222222222222222" as Address;
const LATEST = "0x3333333333333333333333333333333333333333" as Address;
const LOWERCASE = "0xabababababababababababababababababababab" as Address;
const CHECKSUMMED = "0xABaBaBaBABabABabAbAbABAbABabababaBaBABaB" as Address;

const HISTORY: BatcherHistory = {
  retired: [
    { address: OLDEST, lastBatchId: 10n },
    { address: OLDER, lastBatchId: 47n },
  ],
  latest: LATEST,
};

describe("resolveActiveBatcher", () => {
  test("returns the latest batcher without reading anything when nothing is retired", async ({
    sdk,
    provider,
  }) => {
    await expect(resolveActiveBatcher(sdk, { retired: [], latest: LATEST })).resolves.toBe(LATEST);
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("stays on a retired batcher until its last batch is behind it", async ({
    sdk,
    provider,
  }) => {
    mockCurrentBatchIds(provider, { [OLDEST]: 10n, [OLDER]: 0n });
    await expect(resolveActiveBatcher(sdk, HISTORY)).resolves.toBe(OLDEST);
  });

  test("moves on once a retired batcher's current batch passes its last one", async ({
    sdk,
    provider,
  }) => {
    mockCurrentBatchIds(provider, { [OLDEST]: 11n, [OLDER]: 47n });
    await expect(resolveActiveBatcher(sdk, HISTORY)).resolves.toBe(OLDER);
  });

  test("falls through to the latest batcher once every retired one is exhausted", async ({
    sdk,
    provider,
  }) => {
    mockCurrentBatchIds(provider, { [OLDEST]: 11n, [OLDER]: 48n });
    await expect(resolveActiveBatcher(sdk, HISTORY)).resolves.toBe(LATEST);
  });

  test("prefers the oldest eligible batcher, not the newest", async ({ sdk, provider }) => {
    mockCurrentBatchIds(provider, { [OLDEST]: 10n, [OLDER]: 1n });
    await expect(resolveActiveBatcher(sdk, HISTORY)).resolves.toBe(OLDEST);
  });

  test("checksums the address it returns", async ({ sdk }) => {
    await expect(resolveActiveBatcher(sdk, { retired: [], latest: LOWERCASE })).resolves.toBe(
      CHECKSUMMED,
    );
  });
});

describe("batcher history helpers", () => {
  test("normalizeBatcherHistory checksums every address and keeps the order", () => {
    expect(
      normalizeBatcherHistory({
        retired: [{ address: OLDEST.toLowerCase() as Address, lastBatchId: 10n }],
        latest: LOWERCASE,
      }),
    ).toStrictEqual({ retired: [{ address: OLDEST, lastBatchId: 10n }], latest: CHECKSUMMED });
  });

  test("the query key separates histories that differ only by last batch id", () => {
    const shifted: BatcherHistory = {
      retired: [
        { address: OLDEST, lastBatchId: 10n },
        { address: OLDER, lastBatchId: 48n },
      ],
      latest: LATEST,
    };
    expect(vaultQueryKeys.activeBatcher.history(HISTORY)).not.toStrictEqual(
      vaultQueryKeys.activeBatcher.history(shifted),
    );
  });

  test("the query key holds no bigint, so it survives serialization", () => {
    const key = vaultQueryKeys.activeBatcher.history(HISTORY);
    expect(JSON.parse(JSON.stringify(key))).toStrictEqual(key);
  });
});
