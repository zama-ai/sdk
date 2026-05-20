import { describe, test, expect } from "../../test-fixtures";
import { checksum } from "../utils";
import { findPermitToWiden, sortedUnion } from "../permissions";
import type { Permission } from "../types";

const A = checksum("0x1111111111111111111111111111111111111111");
const B = checksum("0x2222222222222222222222222222222222222222");
const C = checksum("0x3333333333333333333333333333333333333333");

describe("sortedUnion", () => {
  test("deduplicates and sorts the union of two arrays", () => {
    expect(sortedUnion([B, A], [A, C])).toEqual([A, B, C]);
  });

  test("returns [] when both inputs are empty", () => {
    expect(sortedUnion([], [])).toEqual([]);
  });

  test("preserves a single input when the other is empty", () => {
    expect(sortedUnion([B, A], [])).toEqual([A, B]);
    expect(sortedUnion([], [B, A])).toEqual([A, B]);
  });
});

const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const SIG_1 = `0x${"a1".repeat(65)}` as const;
const SIG_2 = `0x${"a2".repeat(65)}` as const;
const USER = checksum("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B");

const ADDRS = Array.from({ length: 12 }, (_, i) => {
  const hex = (i + 1).toString(16).padStart(40, "0");
  return checksum(`0x${hex}`);
});
const [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12] = ADDRS as [
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
  (typeof ADDRS)[number],
];

function makePermission(
  signedContractAddresses: Permission["signedContractAddresses"],
  overrides: Partial<Permission> = {},
): Permission {
  return {
    keypairPublicKey: PUBLIC_KEY,
    signerAddress: USER,
    delegatorAddress: USER,
    chainId: 31337,
    signedContractAddresses,
    signature: SIG_1,
    startTimestamp: 1_700_000_000,
    durationDays: 30,
    ...overrides,
  };
}

describe("findPermitToWiden", () => {
  test("returns null when permits is empty", () => {
    expect(findPermitToWiden([], [T1], [T1])).toBeNull();
  });

  test("returns null when no union fits the 10-contract cap", () => {
    const tenSlots = [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10];
    const permits = [makePermission(tenSlots)];
    expect(findPermitToWiden(permits, [T11], [...tenSlots, T11])).toBeNull();
  });

  test("returns the only feasible candidate", () => {
    const permits = [makePermission([T1, T2])];
    const picked = findPermitToWiden(permits, [T3], [T1, T2, T3]);
    expect(picked).toBe(permits[0]);
  });

  test("selects by largest overlap with requested", () => {
    const p1 = makePermission([T1, T2, T11], { signature: SIG_1 });
    const p2 = makePermission([T1, T12, T10], { signature: SIG_2 });
    // requested = [T1, T2, T3]; overlap(p1) = {T1,T2} = 2; overlap(p2) = {T1} = 1
    const picked = findPermitToWiden([p1, p2], [T3], [T1, T2, T3]);
    expect(picked).toBe(p1);
  });

  test("breaks ties by most-recent startTimestamp", () => {
    const older = makePermission([T1, T2], { signature: SIG_1, startTimestamp: 1_700_000_000 });
    const newer = makePermission([T1, T2], { signature: SIG_2, startTimestamp: 1_700_000_500 });
    // Same overlap with requested. Newer wins.
    const picked = findPermitToWiden([older, newer], [T3], [T1, T2, T3]);
    expect(picked).toBe(newer);
  });
});
