import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { createRedisStore } from "../../src/storage/kv-store.js";
import { DelegationStore } from "../../src/indexer/delegation-store.js";
import { BalanceStore } from "../../src/indexer/balance-store.js";
import type { DelegationRecord } from "../../src/acl/types.js";

/**
 * Runs against a REAL local Redis (`REDIS_URL`, default
 * `redis://127.0.0.1:16379` — see WALKTHROUGH.md for the `docker run`
 * command), not a mock — consistent with this project's preference for
 * exercising real dependencies wherever practical. Skipped automatically if
 * Redis isn't reachable, so `pnpm test` (unit only) never depends on it.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:16379";

const DELEGATOR = "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8" as const;
const CONTRACT = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const DELEGATE = "0x89c4580764f8e31B5c1B045392fE3B7f2C083584" as const;

function record(overrides: Partial<DelegationRecord> = {}): DelegationRecord {
  return {
    delegator: DELEGATOR,
    delegate: DELEGATE,
    contractAddress: CONTRACT,
    expirationDate: 2n ** 64n - 1n,
    blockNumber: 100n,
    transactionHash: "0xabc",
    logIndex: 0,
    action: "granted",
    ...overrides,
  };
}

describe("Redis-backed stores (real Redis)", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { lazyConnect: true, retryStrategy: () => null });
    await redis.connect();
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it("round-trips a raw get/set/getAll through real Redis", async () => {
    const store = createRedisStore(redis, "test:raw");
    expect(await store.get("k")).toBeUndefined();
    await store.set("k", "v1");
    expect(await store.get("k")).toBe("v1");
    await store.set("k2", "v2");
    expect(await store.getAll()).toEqual({ k: "v1", k2: "v2" });
  });

  it("DelegationStore survives a simulated restart (new instance, same Redis)", async () => {
    const first = new DelegationStore(createRedisStore(redis, "test:delegations"));
    await first.apply([record()]);
    expect(await first.isKnownActive(DELEGATOR, CONTRACT)).toBe(true);

    // A fresh store instance, as if the process had restarted — same Redis
    // hash name, no in-memory state carried over.
    const second = new DelegationStore(createRedisStore(redis, "test:delegations"));
    expect(await second.isKnownActive(DELEGATOR, CONTRACT)).toBe(true);
    expect(await second.list()).toHaveLength(1);
  });

  it("BalanceStore round-trips a bigint clearValue through real Redis", async () => {
    const store = new BalanceStore(createRedisStore(redis, "test:balances"));
    await store.upsert({
      delegator: DELEGATOR,
      contractAddress: CONTRACT,
      handle: "0xhandle00000000000000000000000000000000000000000000000000000000",
      clearValue: 97_001021n,
      decryptedAtBlock: 42n,
    });

    // Fresh instance again — proves the bigint round-trips through
    // real JSON-in-Redis storage, not just in-process memory.
    const reloaded = new BalanceStore(createRedisStore(redis, "test:balances"));
    const snapshot = await reloaded.get(DELEGATOR, CONTRACT);
    expect(snapshot?.clearValue).toBe(97_001021n);
    expect(typeof snapshot?.clearValue).toBe("bigint");
    expect(snapshot?.decryptedAtBlock).toBe(42n);
  });
});
