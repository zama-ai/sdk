import type { Address } from "viem";
import { type ChecksummedAddress, checksum } from "../schemas/primitives";
export { checksum, type ChecksummedAddress };

/** Maximum number of contract addresses a single permit may bind, enforced by the FHE protocol. */
export const MAX_CONTRACTS_PER_PERMIT = 10;

export const SECONDS_PER_DAY = 86400;

/** Current Unix time in whole seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Deduplicate and sort a list of addresses by their checksummed form. */
export function normalizeAddresses(addresses: readonly Address[]): ChecksummedAddress[] {
  return [...new Set(addresses.map(checksum))].sort();
}
