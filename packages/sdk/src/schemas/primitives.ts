import { type Address, getAddress, isAddress, isHex, type Hex } from "viem";
import { z } from "zod";

declare const checksummedTag: unique symbol;

/** An EVM address that has been put through `getAddress` (EIP-55 checksum form). */
export type ChecksummedAddress = Address & { readonly [checksummedTag]: true };

/** Stamp the brand on an arbitrary `Address` after normalizing it. */
export function checksum(value: Address): ChecksummedAddress {
  return getAddress(value) as ChecksummedAddress;
}

/** `0x`-prefixed hex string. */
export const hex = z
  .string()
  .refine((v): v is Hex => isHex(v, { strict: true }), "expected 0x-prefixed hex string");

/**
 * EVM address that has been EIP-55 checksummed by the schema. Output type is
 * the {@link ChecksummedAddress} brand, so any value flowing out of `.parse`
 * is safe to use as a stable storage / query key.
 */
export const address = z
  .string()
  .refine((v): v is `0x${string}` => isAddress(v, { strict: false }), "expected EVM address")
  .transform(checksum);

/** Non-negative integer Unix timestamp in seconds. */
export const unixSeconds = z.number().int().nonnegative();

/** Positive integer count of seconds (e.g. a TTL). */
export const positiveSeconds = z.number().int().positive();

/** Positive integer count of days (e.g. a permit duration). */
export const positiveDays = z.number().int().positive();

/** Positive integer EVM chain ID. */
export const chainId = z.number().int().positive();
