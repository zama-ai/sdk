import type { Hex } from "viem";
import type { Permission } from "../types";
import type { ChecksummedAddress } from "../../schemas/primitives";
import { MAX_CONTRACTS_PER_PERMIT, SECONDS_PER_DAY } from "../utils";

/** Contracts in `requested` not covered by the signed payload of any permission. */
export function uncoveredContracts(
  permissions: readonly Permission[],
  requested: readonly ChecksummedAddress[],
): ChecksummedAddress[] {
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

/** Drop permissions that are time-expired or bound to a stale keypair. */
export function pruneUnusable(
  permissions: readonly Permission[],
  keypairPublicKey: Hex,
  nowSeconds: number,
): Permission[] {
  return permissions.filter(
    (p) =>
      p.keypairPublicKey === keypairPublicKey &&
      nowSeconds < p.startTimestamp + p.durationDays * SECONDS_PER_DAY,
  );
}

/** Drop every permission whose signed payload touches any address in `contracts`. */
export function withoutPermitsTouching(
  permissions: readonly Permission[],
  contracts: readonly ChecksummedAddress[],
): Permission[] {
  const removeSet = new Set(contracts);
  return permissions.filter((p) => !p.contractAddresses.some((a) => removeSet.has(a)));
}

/** Deduplicate and sort the union of two pre-checksummed address lists. */
export function sortedUnion<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])].toSorted();
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
  const feasible = permissions.filter(
    (p) => new Set([...p.contractAddresses, ...uncovered]).size <= MAX_CONTRACTS_PER_PERMIT,
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
