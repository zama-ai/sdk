import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { assertCondition } from "./assertions";

/** Hex-encoded byte string — 0x-prefixed. */
export type Hex = `0x${string}`;

/** Normalize a un-prefixed hex payload to a 0x-prefixed `Hex` value. */
export function prefixHex(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

/** Convert a public `Hex` value back an unprefixed format. */
export function unprefixHex(value: Hex): string {
  assertCondition(value.startsWith("0x"), `Expected 0x-prefixed hex, got: ${value}`);
  return value.slice(2);
}

/** Check whether `value` is a valid 0x-prefixed hex string. */
export function isHex(value: string): value is Hex {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

/** Keccak-256 hash of raw bytes, returned as a 0x-prefixed hex string. */
export function keccak256(data: Uint8Array): Hex {
  return `0x${bytesToHex(keccak_256(data))}`;
}

/** Convert a UTF-8 string to bytes. */
export function toBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Convert a `Uint8Array` to a 0x-prefixed hex string. */
export function toHex(value: Uint8Array): Hex {
  return `0x${bytesToHex(value)}`;
}
