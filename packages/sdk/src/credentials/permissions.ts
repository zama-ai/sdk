import type { Hex } from "viem";
import type { Permission } from "./types";
import type { ChecksummedAddress } from "../schemas/primitives";
import { MAX_CONTRACTS_PER_PERMIT, SECONDS_PER_DAY } from "./utils";

/** Contracts in `requested` not covered by the signed payload of any permission. */
export function uncoveredContracts(
  permissions: readonly Permission[],
  requested: readonly ChecksummedAddress[],
): ChecksummedAddress[] {
  const covered = new Set(permissions.flatMap((p) => p.signedContractAddresses));
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
  return permissions.filter((p) => !p.signedContractAddresses.some((a) => removeSet.has(a)));
}

/** Deduplicate and sort the union of two pre-checksummed address lists. */
export function sortedUnion<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])].toSorted();
}

/**
 * Pick the in-scope permit best suited to be widened with `uncovered`.
 *
 * Returns the candidate whose `signedContractAddresses ∪ uncovered` still fits
 * the 10-contract cap and that has the largest overlap with `requested`. Ties
 * broken by most-recent `startTimestamp`. Returns `null` when no candidate fits.
 */
export function pickWidenCandidate(
  permits: readonly Permission[],
  uncovered: readonly ChecksummedAddress[],
  requested: readonly ChecksummedAddress[],
): Permission | null {
  const requestedSet = new Set(requested);
  let best: Permission | null = null;
  let bestOverlap = -1;
  let bestTs = -1;

  for (const p of permits) {
    const unionSize = new Set([...p.signedContractAddresses, ...uncovered]).size;
    if (unionSize > MAX_CONTRACTS_PER_PERMIT) {
      continue;
    }
    let overlap = 0;
    for (const a of p.signedContractAddresses) {
      if (requestedSet.has(a)) {
        overlap++;
      }
    }
    if (overlap > bestOverlap || (overlap === bestOverlap && p.startTimestamp > bestTs)) {
      best = p;
      bestOverlap = overlap;
      bestTs = p.startTimestamp;
    }
  }
  return best;
}
