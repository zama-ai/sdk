import { test as baseTest, describe, expect, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import { getAddress, type Address } from "viem";
import { PermissionStore } from "../permission-store";
import type { Permission } from "../types";

const USER = getAddress("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B") as Address;
const DELEGATOR = getAddress("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC") as Address;
const TOKEN_A = getAddress("0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a") as Address;
const TOKEN_B = getAddress("0x3c3C3c3C3c3C3c3c3C3c3C3C3c3c3C3c3c3C3C3c") as Address;
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const OTHER_PUBLIC_KEY = `0x${"22".repeat(32)}` as const;
const SIGNATURE = `0x${"33".repeat(65)}` as const;
const OTHER_SIGNATURE = `0x${"44".repeat(65)}` as const;

const directScope = {
  signerAddress: USER,
  chainId: 31337,
  delegatorAddress: USER,
};

const delegatedScope = {
  signerAddress: USER,
  chainId: 31337,
  delegatorAddress: DELEGATOR,
};

function makePermission(
  overrides: Partial<Permission> & {
    signedContractAddresses: Address[];
  },
): Permission {
  return {
    keypairPublicKey: PUBLIC_KEY,
    signerAddress: USER,
    delegatorAddress: USER,
    chainId: 31337,
    signature: SIGNATURE,
    startTimestamp: Math.floor(Date.now() / 1000),
    durationDays: 30,
    ...overrides,
  };
}

const test = baseTest.extend<{ store: PermissionStore }>({
  // eslint-disable-next-line no-empty-pattern
  store: async ({}, use) => {
    await use(new PermissionStore({ storage: new MemoryStorage() }));
  },
});

describe("PermissionStore", () => {
  test("append + list round-trips, replaces in place when contracts match", async ({ store }) => {
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A], signature: SIGNATURE }),
    ]);
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A], signature: OTHER_SIGNATURE }),
    ]);

    const list = await store.list(directScope);
    expect(list).toHaveLength(1);
    expect(list[0]!.signature).toBe(OTHER_SIGNATURE);
    expect(list[0]!.signedContractAddresses).toEqual([TOKEN_A]);
  });

  test("deletePermitsTouching drops every permit containing a listed address", async ({
    store,
  }) => {
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A, TOKEN_B] }),
    ]);
    await store.deletePermitsTouching(directScope, [TOKEN_A]);
    expect(await store.list(directScope)).toEqual([]);
  });

  test("clear() removes the scope entry", async ({ store }) => {
    await store.append(directScope, [makePermission({ signedContractAddresses: [TOKEN_A] })]);
    await store.clear(directScope);
    expect(await store.list(directScope)).toEqual([]);
  });

  test("direct and delegated scopes are isolated; clearAllForSigner cascades", async ({
    store,
  }) => {
    await store.append(directScope, [makePermission({ signedContractAddresses: [TOKEN_A] })]);
    await store.append(delegatedScope, [
      makePermission({
        signedContractAddresses: [TOKEN_B],
        delegatorAddress: DELEGATOR,
      }),
    ]);

    expect(await store.list(directScope)).toHaveLength(1);
    expect(await store.list(delegatedScope)).toHaveLength(1);

    await store.clearAllForSigner(USER);
    expect(await store.list(directScope)).toEqual([]);
    expect(await store.list(delegatedScope)).toEqual([]);
  });

  test("listUsableAndPrune drops time-expired permits", async ({ store }) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const startSeconds = Math.floor(Date.now() / 1000);
      await store.append(directScope, [
        makePermission({
          signedContractAddresses: [TOKEN_A],
          startTimestamp: startSeconds,
          durationDays: 30,
        }),
      ]);

      // Advance just past the 30-day permit lifetime.
      vi.advanceTimersByTime((30 * 86400 + 1) * 1000);

      expect(await store.listUsableAndPrune(directScope, PUBLIC_KEY)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("listUsableAndPrune filters out permissions bound to other keypairs", async ({ store }) => {
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A], keypairPublicKey: OTHER_PUBLIC_KEY }),
    ]);
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_B], keypairPublicKey: PUBLIC_KEY }),
    ]);

    const surviving = await store.listUsableAndPrune(directScope, PUBLIC_KEY);
    expect(surviving).toHaveLength(1);
    expect(surviving[0]!.signedContractAddresses).toEqual([TOKEN_B]);
  });
});
