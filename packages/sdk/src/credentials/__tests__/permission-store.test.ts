import { describe, expect, it } from "../../test-fixtures";
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

describe("PermissionStore", () => {
  it("add then list round-trips a permission", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    const permission = makePermission({ signedContractAddresses: [TOKEN_A] });
    await store.append(directScope, [permission]);
    const list = await store.list(directScope);
    expect(list).toHaveLength(1);
    expect(list[0]!.signedContractAddresses).toEqual([TOKEN_A]);
  });

  it("add replaces in place when signedContractAddresses match", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A], signature: SIGNATURE }),
    ]);
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A], signature: OTHER_SIGNATURE }),
    ]);
    const list = await store.list(directScope);
    expect(list).toHaveLength(1);
    expect(list[0]!.signature).toBe(OTHER_SIGNATURE);
  });

  it("deletePermitsTouching drops every permit that contains a listed address", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    await store.append(directScope, [
      makePermission({ signedContractAddresses: [TOKEN_A, TOKEN_B] }),
    ]);
    await store.deletePermitsTouching(directScope, [TOKEN_A]);
    const list = await store.list(directScope);
    expect(list).toHaveLength(0);

    await store.append(directScope, [makePermission({ signedContractAddresses: [TOKEN_B] })]);
    await store.deletePermitsTouching(directScope, [TOKEN_B]);
    const after = await store.list(directScope);
    expect(after).toHaveLength(0);
  });

  it("clear() removes the scope entry", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    await store.append(directScope, [makePermission({ signedContractAddresses: [TOKEN_A] })]);
    await store.clear(directScope);
    expect(await store.list(directScope)).toEqual([]);
  });

  it("direct and delegated scopes do not collide", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    await store.append(directScope, [makePermission({ signedContractAddresses: [TOKEN_A] })]);
    await store.append(delegatedScope, [
      makePermission({
        signedContractAddresses: [TOKEN_B],
        delegatorAddress: DELEGATOR,
      }),
    ]);
    expect(await store.list(directScope)).toHaveLength(1);
    expect(await store.list(delegatedScope)).toHaveLength(1);
  });

  it("clearAllForSigner wipes every scope across delegators", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    await store.append(directScope, [makePermission({ signedContractAddresses: [TOKEN_A] })]);
    await store.append(delegatedScope, [
      makePermission({
        signedContractAddresses: [TOKEN_B],
        delegatorAddress: DELEGATOR,
      }),
    ]);
    await store.clearAllForSigner(USER);
    expect(await store.list(directScope)).toEqual([]);
    expect(await store.list(delegatedScope)).toEqual([]);
  });

  it("drops malformed permission lists from storage", async () => {
    const storage = new MemoryStorage();
    const store = new PermissionStore({ storage });
    const key = await PermissionStore.scopeKey(directScope);
    await storage.set(key, [
      makePermission({ signedContractAddresses: [TOKEN_A] }),
      { invalid: true },
    ]);

    expect(await store.list(directScope)).toEqual([]);
    expect(await storage.get(key)).toBeNull();
  });

  it("does not trust corrupted signer indexes", async () => {
    const storage = new MemoryStorage();
    const store = new PermissionStore({ storage });
    const indexKey = await PermissionStore.indexKey(USER);
    await storage.set("unrelated", "keep");
    await storage.set(indexKey, ["unrelated"]);

    await store.clearAllForSigner(USER);

    expect(await storage.get("unrelated")).toBe("keep");
    expect(await storage.get(indexKey)).toBeNull();
  });

  it("listUsableAndPrune removes time-expired permits", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
    await store.append(directScope, [
      makePermission({
        signedContractAddresses: [TOKEN_A],
        startTimestamp: Math.floor(Date.now() / 1000) - 60 * 86400,
        durationDays: 30,
      }),
    ]);
    const surviving = await store.listUsableAndPrune(directScope, PUBLIC_KEY);
    expect(surviving).toEqual([]);
  });

  it("listUsableAndPrune filters out permissions bound to other keypairs", async () => {
    const store = new PermissionStore({ storage: new MemoryStorage() });
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
