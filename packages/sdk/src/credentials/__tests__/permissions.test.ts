import type { Hex } from "viem";
import { describe, test, expect } from "../../test-fixtures";
import { checksum } from "../utils";
import {
  findPermitToWiden,
  isWildcardPermission,
  pruneUnusable,
  sortedUnion,
  uncoveredContracts,
  withoutPermitsTouching,
} from "../permissions";
import type { Permission } from "../types";
import type { ChecksummedAddress } from "../../schemas/primitives";

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
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
  ChecksummedAddress,
];

function makePermission(
  contractAddresses: Permission["contractAddresses"],
  overrides: {
    signature?: Hex;
    keypairPublicKey?: Hex;
    startTimestamp?: number;
    durationDays?: number;
  } = {},
): Permission {
  const {
    signature = SIG_1,
    keypairPublicKey = PUBLIC_KEY,
    startTimestamp = 1_700_000_000,
    durationDays = 30,
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

/** A V2 permit; `contractAddresses: []` makes it a wildcard permit. */
function makeV2Permission(
  contractAddresses: Permission["contractAddresses"],
  overrides: {
    signature?: Hex;
    keypairPublicKey?: Hex;
    startTimestamp?: number;
    durationSeconds?: number;
  } = {},
): Permission {
  const {
    signature = SIG_1,
    keypairPublicKey = PUBLIC_KEY,
    startTimestamp = 1_700_000_000,
    durationSeconds = 30 * 86400,
  } = overrides;
  return {
    version: 2,
    keypairPublicKey,
    contractAddresses,
    startTimestamp,
    durationSeconds,
    serializedPermit: {
      version: 2,
      eip712: { primaryType: "UserDecryptRequestVerification", domain: {}, types: {}, message: {} },
      signature,
      signerAddress: USER,
    },
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

  test("never returns a wildcard permit as a widen candidate", () => {
    const wildcard = makeV2Permission([]);
    // A wildcard's contractAddresses is [], so it trivially "fits" the cap —
    // must still be excluded, or widening it would downgrade it to a narrow permit.
    const picked = findPermitToWiden([wildcard], [T1], [T1]);
    expect(picked).toBeNull();
  });
});

describe("isWildcardPermission", () => {
  test("true for a V2 permit with an empty contract list", () => {
    expect(isWildcardPermission(makeV2Permission([]))).toBe(true);
  });

  test("false for a V2 permit with specific contracts", () => {
    expect(isWildcardPermission(makeV2Permission([T1]))).toBe(false);
  });

  test("false for a V1 permit, regardless of contract list", () => {
    expect(isWildcardPermission(makePermission([T1]))).toBe(false);
  });
});

describe("uncoveredContracts", () => {
  test("returns addresses not listed by any permission", () => {
    expect(uncoveredContracts([makePermission([T1])], [T1, T2])).toEqual([T2]);
  });

  test("a valid wildcard permit covers every requested contract, including unseen ones", () => {
    const permissions = [makeV2Permission([])];
    expect(uncoveredContracts(permissions, [T1, T2, T3])).toEqual([]);
  });

  test("a wildcard permit covers requests even when other specific permits also exist", () => {
    const permissions = [makePermission([T1]), makeV2Permission([])];
    expect(uncoveredContracts(permissions, [T2, T3])).toEqual([]);
  });
});

describe("pruneUnusable", () => {
  const NOW = 1_700_100_000;

  test("keeps a V1 permit within its durationDays window and drops one past it", () => {
    const fresh = makePermission([T1], { startTimestamp: NOW - 10 * 86400, durationDays: 30 });
    const expired = makePermission([T2], {
      signature: SIG_2,
      startTimestamp: NOW - 40 * 86400,
      durationDays: 30,
    });
    const surviving = pruneUnusable([fresh, expired], PUBLIC_KEY, NOW);
    expect(surviving).toEqual([fresh]);
  });

  test("keeps a V2 permit within its durationSeconds window and drops one past it", () => {
    const fresh = makeV2Permission([], { startTimestamp: NOW - 100, durationSeconds: 200 });
    const expired = makeV2Permission([T1], {
      signature: SIG_2,
      startTimestamp: NOW - 300,
      durationSeconds: 200,
    });
    const surviving = pruneUnusable([fresh, expired], PUBLIC_KEY, NOW);
    expect(surviving).toEqual([fresh]);
  });

  test("a wildcard permit is dropped once its window elapses, same as any other permit", () => {
    const expiredWildcard = makeV2Permission([], {
      startTimestamp: NOW - 300,
      durationSeconds: 200,
    });
    expect(pruneUnusable([expiredWildcard], PUBLIC_KEY, NOW)).toEqual([]);
  });
});

describe("withoutPermitsTouching", () => {
  test("drops permits whose contract list includes a removed address", () => {
    const p1 = makePermission([T1, T2]);
    const p2 = makePermission([T3], { signature: SIG_2 });
    expect(withoutPermitsTouching([p1, p2], [T1])).toEqual([p2]);
  });

  test("a wildcard permit is always dropped by a non-empty removal list — it covers every contract", () => {
    const wildcard = makeV2Permission([]);
    const specific = makePermission([T1], { signature: SIG_2 });
    expect(withoutPermitsTouching([wildcard, specific], [T2])).toEqual([specific]);
  });
});
