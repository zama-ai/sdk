import { getAddress, type Address } from "viem";

/** Maximum number of contract addresses a single permit may bind, enforced by the FHE protocol. */
export const MAX_CONTRACTS_PER_PERMIT = 10;

export const SECONDS_PER_DAY = 86400;

/** Current Unix time in whole seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

declare const checksummedTag: unique symbol;

/** An EVM address that has been put through `getAddress` (EIP-55 checksum form). */
export type ChecksummedAddress = Address & { readonly [checksummedTag]: true };

/** Stamp the brand on an arbitrary `Address` after normalizing it. */
export function checksum(address: Address): ChecksummedAddress {
  return getAddress(address) as ChecksummedAddress;
}

/** Deduplicate and sort a list of addresses by their checksummed form. */
export function normalizeAddresses(addresses: readonly Address[]): ChecksummedAddress[] {
  return [...new Set(addresses.map(checksum))].toSorted();
}
