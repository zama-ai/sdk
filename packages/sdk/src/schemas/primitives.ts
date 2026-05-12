import { type Address, getAddress, isAddress, isHex, type Hex } from "viem";
import { z } from "zod/mini";

declare const checksummedTag: unique symbol;

/** An EVM address that has been put through `getAddress` (EIP-55 checksum form). */
export type ChecksummedAddress = Address & { readonly [checksummedTag]: true };

/** Stamp the brand on an arbitrary `Address` after normalizing it. */
export function checksum(value: Address): ChecksummedAddress {
  return getAddress(value) as ChecksummedAddress;
}

/** `0x`-prefixed hex string. */
export const hex = z.custom<Hex>(
  (v) => typeof v === "string" && isHex(v, { strict: true }),
  "expected 0x-prefixed hex string",
);

/** Validates an EVM address string. Output type is `Address` (`` `0x${string}` ``). */
export const evmAddress = z.custom<Address>(
  (v) => typeof v === "string" && isAddress(v, { strict: false }),
  "expected EVM address",
);

/** Validates and EIP-55 checksums an EVM address. Output is {@link ChecksummedAddress}. */
export const checksummedAddress = z.pipe(evmAddress, z.transform(checksum));

/** Non-negative integer Unix timestamp in seconds. */
export const unixSeconds = z.int().check(z.nonnegative());

/** Positive integer count of seconds (e.g. a TTL). */
export const positiveSeconds = z.int().check(z.positive());

/** Non-negative integer count of seconds (e.g. a cache TTL where 0 disables caching). */
export const nonNegativeSeconds = z.int().check(z.nonnegative());

/** Positive integer count of days (e.g. a permit duration). */
export const positiveDays = z.int().check(z.positive());

/** Positive integer EVM chain ID. */
export const chainId = z.int().check(z.positive());
