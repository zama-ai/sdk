import type { Hex } from "viem";
import type { Permission } from "./types";
import type { ChecksummedAddress } from "../schemas/primitives";
import { MAX_CONTRACTS_PER_PERMIT, SECONDS_PER_DAY } from "./utils";

/**
 * A V2 permit with an empty `contractAddresses` list is permissive/wildcard —
 * it covers every contract, not zero. V1 permits never have this shape (an
 * empty list is rejected before a V1 permit is ever signed or stored).
 */
export function isWildcardPermission(permission: Permission): boolean {
  return permission.version === 2 && permission.contractAddresses.length === 0;
}

/** Whether `permission`'s signed payload covers `address` — always true for a wildcard permit. */
export function permissionCovers(permission: Permission, address: ChecksummedAddress): boolean {
  return isWildcardPermission(permission) || permission.contractAddresses.includes(address);
}

/** Whether `permission`'s signed payload covers any address in `addresses` — always true for a wildcard permit. */
export function permissionCoversAny(
  permission: Permission,
  addresses: ReadonlySet<ChecksummedAddress>,
): boolean {
  return (
    isWildcardPermission(permission) || permission.contractAddresses.some((a) => addresses.has(a))
  );
}

/** Contracts in `requested` not covered by the signed payload of any permission. */
export function uncoveredContracts(
  permissions: readonly Permission[],
  requested: readonly ChecksummedAddress[],
): ChecksummedAddress[] {
  if (permissions.some(isWildcardPermission)) {
    return [];
  }
  const covered = new Set(permissions.flatMap((p) => p.contractAddresses));
  return requested.filter((addr) => !covered.has(addr));
}

/** Split a list of addresses into permit-sized chunks (≤ {@link MAX_CONTRACTS_PER_PERMIT}). */
export function chunkContracts(addresses: readonly ChecksummedAddress[]): ChecksummedAddress[][] {
  const chunks: ChecksummedAddress[][] = [];
  for (let i = 0; i < addresses.length; i += MAX_CONTRACTS_PER_PERMIT) {
    chunks.push(addresses.slice(i, i + MAX_CONTRACTS_PER_PERMIT));
  }
  return chunks;
}

/** The permit's validity window length in seconds, regardless of version. */
function durationSecondsOf(permission: Permission): number {
  return permission.version === 1
    ? permission.durationDays * SECONDS_PER_DAY
    : permission.durationSeconds;
}

/** Drop permissions that are time-expired or bound to a stale keypair. */
export function pruneUnusable(
  permissions: readonly Permission[],
  keypairPublicKey: Hex,
  nowSeconds: number,
): Permission[] {
  return permissions.filter(
    (p) =>
      p.keypairPublicKey === keypairPublicKey &&
      nowSeconds < p.startTimestamp + durationSecondsOf(p),
  );
}

/**
 * Drop every permission whose signed payload touches any address in `contracts`.
 * A wildcard permit ({@link isWildcardPermission}) touches every contract, so it
 * is always dropped by a non-empty `contracts` list — leaving it in place would
 * silently defeat a caller's "revoke my access to this contract" request.
 */
export function withoutPermitsTouching(
  permissions: readonly Permission[],
  contracts: readonly ChecksummedAddress[],
): Permission[] {
  const removeSet = new Set(contracts);
  return permissions.filter((p) => !permissionCoversAny(p, removeSet));
}

/** Deduplicate and sort the union of two pre-checksummed address lists. */
export function sortedUnion<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])].sort();
}

/**
 * Find the in-scope permit best suited to be widened with `uncovered`.
 *
 * Returns the permit whose `contractAddresses ∪ uncovered` still fits
 * the 10-contract cap and that has the largest overlap with `requested`. Ties
 * broken by most-recent `startTimestamp`. Returns `null` when none fits.
 */
export function findPermitToWiden(
  permissions: readonly Permission[],
  uncovered: readonly ChecksummedAddress[],
  requested: readonly ChecksummedAddress[],
): Permission | null {
  const requestedSet = new Set(requested);
  // A wildcard permit already covers everything, so it never legitimately reaches
  // here (callers check `uncoveredContracts` first); excluded explicitly so it can
  // never be mistaken for a widen candidate and re-signed as a narrow permit.
  const feasible = permissions.filter(
    (p) =>
      !isWildcardPermission(p) &&
      new Set([...p.contractAddresses, ...uncovered]).size <= MAX_CONTRACTS_PER_PERMIT,
  );
  if (feasible.length === 0) {
    return null;
  }

  function overlap(p: Permission) {
    return p.contractAddresses.reduce((n, a) => n + (requestedSet.has(a) ? 1 : 0), 0);
  }

  const maxOverlap = Math.max(...feasible.map(overlap));
  const topTier = feasible.filter((p) => overlap(p) === maxOverlap);
  return topTier.reduce((a, b) => (b.startTimestamp > a.startTimestamp ? b : a));
}
