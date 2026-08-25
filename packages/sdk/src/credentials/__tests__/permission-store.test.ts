import type { Hex } from "viem";
import { test as baseTest, describe, expect, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import { PermissionStore } from "../permission-store";
import { permissionScopeKey } from "../storage-keys";
import type { Permission } from "../types";
import { checksum } from "../utils";

const USER = checksum("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B");
const DELEGATOR = checksum("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC");
const TOKEN_A = checksum("0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
const TOKEN_B = checksum("0x3c3C3c3C3c3C3c3c3C3c3C3C3c3c3C3c3c3C3C3c");
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const OTHER_PUBLIC_KEY = `0x${"22".repeat(32)}` as const;
const SIGNATURE = `0x${"33".repeat(65)}` as const;

const directScope = { signerAddress: USER, chainId: 31337, delegatorAddress: USER };

const delegatedScope = { signerAddress: USER, chainId: 31337, delegatorAddress: DELEGATOR };

function makePermission(overrides: {
  contractAddresses: Permission["contractAddresses"];
  signature?: Hex;
  keypairPublicKey?: Hex;
  startTimestamp?: number;
  durationDays?: number;
}): Permission {
  const {
    signature = SIGNATURE,
    keypairPublicKey = PUBLIC_KEY,
    startTimestamp = Math.floor(Date.now() / 1000),
    durationDays = 30,
    contractAddresses,
  } = overrides;
  return {
    version: 1,
    keypairPublicKey,
    contractAddresses,
    startTimestamp,
    durationDays,
    serializedPermit: {
      version: 1,
      eip712: { primaryType: "UserDecryptRequestVerification", domain: {}, types: {}, message: {} },
      signature,
      signerAddress: USER,
    },
  };
}

const test = baseTest.extend<{ store: PermissionStore }>({
  // eslint-disable-next-line no-empty-pattern
  store: async ({}, use) => {
    await use(
      new PermissionStore({
        storage: new MemoryStorage(),
        logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      }),
    );
  },
});

describe("PermissionStore", () => {
  test("append + list round-trips", async ({ store }) => {
    await store.append(directScope, [
      makePermission({ contractAddresses: [TOKEN_A], signature: SIGNATURE }),
    ]);

    const list = await store.list(directScope);
    expect(list).toHaveLength(1);
    expect(list[0]!.serializedPermit.signature).toBe(SIGNATURE);
    expect(list[0]!.contractAddresses).toEqual([TOKEN_A]);
  });

  test("deletePermitsTouching drops every permit containing a listed address", async ({
    store,
  }) => {
    await store.append(directScope, [makePermission({ contractAddresses: [TOKEN_A, TOKEN_B] })]);
    await store.deletePermitsTouching(directScope, [TOKEN_A]);
    expect(await store.list(directScope)).toEqual([]);
  });

  test("direct and delegated scopes are isolated; clearAllForSigner cascades", async ({
    store,
  }) => {
    await store.append(directScope, [makePermission({ contractAddresses: [TOKEN_A] })]);
    await store.append(delegatedScope, [makePermission({ contractAddresses: [TOKEN_B] })]);

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
          contractAddresses: [TOKEN_A],
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
      makePermission({ contractAddresses: [TOKEN_A], keypairPublicKey: OTHER_PUBLIC_KEY }),
    ]);
    await store.append(directScope, [
      makePermission({ contractAddresses: [TOKEN_B], keypairPublicKey: PUBLIC_KEY }),
    ]);

    const surviving = await store.listUsableAndPrune(directScope, PUBLIC_KEY);
    expect(surviving).toHaveLength(1);
    expect(surviving[0]!.contractAddresses).toEqual([TOKEN_B]);
  });

  test("replace swaps the entry identified by signature", async ({ store }) => {
    const SIG_OLD = `0x${"aa".repeat(65)}` as const;
    const SIG_NEW = `0x${"bb".repeat(65)}` as const;
    const SIG_OTHER = `0x${"cc".repeat(65)}` as const;

    await store.append(directScope, [
      makePermission({ contractAddresses: [TOKEN_A], signature: SIG_OLD }),
      makePermission({ contractAddresses: [TOKEN_B], signature: SIG_OTHER }),
    ]);

    await store.replace(
      directScope,
      SIG_OLD,
      makePermission({ contractAddresses: [TOKEN_A, TOKEN_B], signature: SIG_NEW }),
    );

    const list = await store.list(directScope);
    const signatures = list.map((p) => p.serializedPermit.signature).sort();
    expect(signatures).toEqual([SIG_OTHER, SIG_NEW].sort());
    expect(list.find((p) => p.serializedPermit.signature === SIG_NEW)?.contractAddresses).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
    expect(list.find((p) => p.serializedPermit.signature === SIG_OLD)).toBeUndefined();
  });

  test("replace with an unknown signature behaves like append", async ({ store }) => {
    const SIG_EXISTING = `0x${"dd".repeat(65)}` as const;
    const SIG_NEW = `0x${"ee".repeat(65)}` as const;
    const SIG_MISSING = `0x${"ff".repeat(65)}` as const;

    await store.append(directScope, [
      makePermission({ contractAddresses: [TOKEN_A], signature: SIG_EXISTING }),
    ]);

    await store.replace(
      directScope,
      SIG_MISSING,
      makePermission({ contractAddresses: [TOKEN_B], signature: SIG_NEW }),
    );

    const list = await store.list(directScope);
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.serializedPermit.signature).sort()).toEqual(
      [SIG_EXISTING, SIG_NEW].sort(),
    );
  });

  test("a permit stored by a pre-V2 SDK (no top-level `version` field) still loads as V1, not wiped", async () => {
    // Exactly the on-disk shape every permit had before the V1/V2 discriminant
    // existed — no top-level `version`, only the nested `serializedPermit.version`.
    const legacyStoredPermit = {
      keypairPublicKey: PUBLIC_KEY,
      contractAddresses: [TOKEN_A],
      startTimestamp: Math.floor(Date.now() / 1000),
      durationDays: 30,
      serializedPermit: {
        version: 1,
        eip712: {
          primaryType: "UserDecryptRequestVerification",
          domain: {},
          types: {},
          message: {},
        },
        signature: SIGNATURE,
        signerAddress: USER,
      },
    };
    const storage = new MemoryStorage();
    await storage.set(permissionScopeKey(directScope), [legacyStoredPermit]);
    const store = new PermissionStore({
      storage,
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    });

    const list = await store.list(directScope);

    expect(list).toHaveLength(1);
    expect(list[0]?.version).toBe(1);
    expect(list[0]?.contractAddresses).toEqual([TOKEN_A]);
    // Confirm it wasn't treated as corrupt and wiped from storage.
    expect(await storage.get(permissionScopeKey(directScope))).not.toBeNull();
  });
});
