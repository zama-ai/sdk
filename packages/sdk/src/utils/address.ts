import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** EVM address — 0x-prefixed, 40 hex chars. */
export type Address = `0x${string}`;

/** The zero address */
export const zeroAddress: Address = "0x0000000000000000000000000000000000000000" as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Compute the EIP-55 checksummed form of a bare (no 0x) lowercase address. */
function applyChecksum(bare: string): Address {
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(bare)));
  let result: Address = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = parseInt(hash[i] as string, 16);
    result += nibble >= 8 ? (bare[i] as string).toUpperCase() : bare[i];
  }
  return result;
}

/**
 * Check whether `value` is a valid 0x-prefixed, 20-byte hex address.
 *
 * @param strict - When `true` (default), also verifies the EIP-55 checksum
 *   if the address contains mixed-case letters. All-lowercase and all-uppercase
 *   addresses pass regardless since they carry no checksum information.
 */
export function isAddress(
  value: string,
  { strict = true }: { strict?: boolean } = {},
): value is Address {
  if (!ADDRESS_RE.test(value)) {
    return false;
  }
  if (!strict) {
    return true;
  }

  const bare = value.slice(2);
  if (bare === bare.toLowerCase() || bare === bare.toUpperCase()) {
    return true;
  }

  return value === applyChecksum(bare.toLowerCase());
}

/**
 * Return the EIP-55 checksummed form of an Ethereum address.
 * Throws if the input is not a valid 20-byte hex address.
 */
export function checksumAddress(address: string): Address {
  if (!isAddress(address, { strict: false })) {
    throw new Error(`Address "${address}" is invalid.`);
  }
  return applyChecksum(address.slice(2).toLowerCase());
}

/** Alias for {@link checksumAddress} — drop-in replacement for viem's `getAddress`. */
export const getAddress = checksumAddress;
