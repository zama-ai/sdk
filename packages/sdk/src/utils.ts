import { isAddress } from "viem";
import type { Address } from "./relayer/relayer-sdk.types";

/** Convert a Uint8Array to a hex string prefixed with `0x`. */
export function toHex(bytes: Uint8Array): Address {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

// ── Runtime type assertion helpers ───────────────────────────

export function assertAddress(value: string, name: string): asserts value is Address {
  if (!isAddress(value, { strict: false })) {
    throw new TypeError(`${name} must be a valid address (0x + 40 hex chars), got: ${value}`);
  }
}

/**
 * Validate an address and return it unchanged.
 * Call at public API entry points so invalid addresses are caught early.
 *
 * Addresses are **not** lowercased — the relayer SDK requires EIP-55
 * checksummed addresses for encrypt / decrypt calls.
 * Use case-insensitive comparison (`.toLowerCase()`) when comparing addresses.
 */
export function normalizeAddress(addr: string, name: string): Address {
  assertAddress(addr, name);
  return addr as Address;
}

/** Alias for {@link normalizeAddress}. */
export const validateAddress = normalizeAddress;

// ── Handle normalization ────────────────────────────────────

const HEX_REGEX = /^0x[0-9a-fA-F]+$/;

/**
 * Normalize a ciphertext handle to a zero-padded 32-byte hex string.
 * Accepts a `bigint` or a `0x`-prefixed hex string.
 */
export function normalizeHandle(handle: string | bigint): `0x${string}` {
  if (typeof handle === "bigint") {
    return `0x${handle.toString(16).padStart(64, "0")}`;
  }
  if (typeof handle === "string" && HEX_REGEX.test(handle)) {
    return handle as `0x${string}`;
  }
  throw new TypeError("Handle must be a hex string or bigint");
}

export function assertObject(
  value: unknown,
  context: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object, got ${typeof value}`);
  }
}

export function assertString(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${context} must be a string, got ${typeof value}`);
  }
}

export function assertArray(value: unknown, context: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array, got ${typeof value}`);
  }
}

export function assertNonNullable<T>(value: T, context: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new TypeError(`${context} must not be ${value}`);
  }
}

export function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new TypeError(message);
  }
}

// ── Concurrency helper ──────────────────────────────────────

/**
 * Execute an array of async thunks with bounded concurrency.
 * Defaults to `Infinity` (equivalent to `Promise.all`).
 */
export async function pLimit<T>(
  fns: Array<() => Promise<T>>,
  maxConcurrency = Infinity,
): Promise<T[]> {
  if (!isFinite(maxConcurrency) || maxConcurrency >= fns.length) {
    return Promise.all(fns.map((f) => f()));
  }

  const results: T[] = new Array(fns.length);
  let index = 0;

  async function worker() {
    while (index < fns.length) {
      const i = index++;
      results[i] = await fns[i]!();
    }
  }

  await Promise.all(Array.from({ length: maxConcurrency }, worker));
  return results;
}
