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

/** Validates an EVM address string. Output type is `Address` (`` `0x${string}` ``). */
export const evmAddress = z
  .string()
  .refine((v): v is Address => isAddress(v, { strict: false }), "expected EVM address");

/** Validates and EIP-55 checksums an EVM address. Output is {@link ChecksummedAddress}. */
export const checksummedAddress = evmAddress.transform(checksum);

/** Non-negative integer Unix timestamp in seconds. */
export const unixSeconds = z.number().int().nonnegative();

/** Positive integer count of seconds (e.g. a TTL). */
export const positiveSeconds = z.number().int().positive();

/** Non-negative integer count of seconds (e.g. a cache TTL where 0 disables caching). */
export const nonNegativeSeconds = z.number().int().nonnegative();

/** Positive integer count of days (e.g. a permit duration). */
export const positiveDays = z.number().int().positive();

/** Positive integer EVM chain ID. */
export const chainId = z.number().int().positive();
