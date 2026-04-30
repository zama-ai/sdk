import { getAddress, type Address } from "viem";

/** Maximum number of contract addresses a single permit may bind, enforced by the FHE protocol. */
export const MAX_CONTRACTS_PER_PERMIT = 10;

/** Deduplicate and sort a list of addresses by their checksummed form. */
export function normalizeAddresses(addresses: readonly Address[]): Address[] {
  return [...new Set(addresses.map((address) => getAddress(address)))].toSorted();
}

/** Check that the signed address set covers all required addresses. */
export function coversContracts(signed: readonly Address[], required: readonly Address[]): boolean {
  if (required.length === 0) {
    return true;
  }
  const requiredSet = new Set(required.map((a) => getAddress(a)));
  const signedSet = new Set(signed.map((a) => getAddress(a)));
  return [...requiredSet].every((addr) => signedSet.has(addr));
}
