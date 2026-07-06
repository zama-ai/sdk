import { describe, expect, it } from "vitest";
import type { DelegationRecord } from "../../src/acl/types.js";
import { DelegationStore } from "../../src/indexer/delegation-store.js";
import { createInMemoryStore } from "../../src/storage/kv-store.js";

const DELEGATOR = "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8" as const;
const CONTRACT = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const DELEGATE = "0x89c4580764f8e31B5c1B045392fE3B7f2C083584" as const;

function record(overrides: Partial<DelegationRecord>): DelegationRecord {
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

describe("DelegationStore", () => {
  it("is not active before any event is applied", async () => {
    const store = new DelegationStore(createInMemoryStore());
    expect(await store.isKnownActive(DELEGATOR, CONTRACT)).toBe(false);
  });

  it("becomes active after a grant", async () => {
    const store = new DelegationStore(createInMemoryStore());
    await store.apply([record({ action: "granted", blockNumber: 100n })]);
    expect(await store.isKnownActive(DELEGATOR, CONTRACT)).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });

  it("becomes inactive after a later revoke", async () => {
    const store = new DelegationStore(createInMemoryStore());
    await store.apply([
      record({ action: "granted", blockNumber: 100n, logIndex: 0 }),
      record({ action: "revoked", blockNumber: 200n, logIndex: 0 }),
    ]);
    expect(await store.isKnownActive(DELEGATOR, CONTRACT)).toBe(false);
    expect(await store.list()).toHaveLength(0);
  });

  it("ignores an out-of-order (stale) event applied after a newer one", async () => {
    const store = new DelegationStore(createInMemoryStore());
    await store.apply([record({ action: "revoked", blockNumber: 200n })]);
    // A grant from an earlier block arriving late (e.g. re-org, or unordered fetch) must not resurrect it.
    await store.apply([record({ action: "granted", blockNumber: 100n })]);
    expect(await store.isKnownActive(DELEGATOR, CONTRACT)).toBe(false);
  });

  it("re-grant after revoke (same block ordering) re-activates", async () => {
    const store = new DelegationStore(createInMemoryStore());
    await store.apply([
      record({ action: "granted", blockNumber: 100n }),
      record({ action: "revoked", blockNumber: 200n }),
      record({ action: "granted", blockNumber: 300n }),
    ]);
    expect(await store.isKnownActive(DELEGATOR, CONTRACT)).toBe(true);
  });

  it("tracks separate (delegator, contractAddress) pairs independently", async () => {
    const store = new DelegationStore(createInMemoryStore());
    const otherContract = "0x0000000000000000000000000000000000dEaD" as const;
    await store.apply([record({ contractAddress: otherContract, action: "granted" })]);
    expect(await store.isKnownActive(DELEGATOR, otherContract)).toBe(true);
    expect(await store.isKnownActive(DELEGATOR, CONTRACT)).toBe(false);
  });
});
