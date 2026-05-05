import type { Hex } from "viem";
import type { Permission } from "./types";
import type { ChecksummedAddress } from "./utils";
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
