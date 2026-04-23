import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** EVM address — 0x-prefixed, 40 hex chars. */
export type Address = `0x${string}`;

/** The zero address (`0x0000000000000000000000000000000000000000`). */
export const zeroAddress: Address = "0x0000000000000000000000000000000000000000";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Check whether `value` is a valid 0x-prefixed, 20-byte hex address. */
export function isAddress(value: string): value is Address {
  return ADDRESS_RE.test(value);
}

/**
 * Return the EIP-55 checksummed form of an Ethereum address.
 * Throws if the input is not a valid 20-byte hex address.
 */
export function checksumAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new Error(`Address "${address}" is invalid.`);
  }
  const bare = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(bare)));

  let result = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = parseInt(hash[i] as string, 16);
    result += nibble >= 8 ? (bare[i] as string).toUpperCase() : bare[i];
  }
  return result as Address;
}

/** Alias for {@link checksumAddress} — drop-in replacement for viem's `getAddress`. */
export const getAddress = checksumAddress;
