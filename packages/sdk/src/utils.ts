import { hexToBigInt, isAddress, isHex, toHex } from "viem";
import type { Address, Handle } from "./relayer/relayer-sdk.types";

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
 * Addresses are preserved exactly as provided.
 * Use `getAddress()` from viem when you need canonical EIP-55 checksumming.
 */
export function validateAddress(addr: string, name: string): Address {
  assertAddress(addr, name);
  return addr;
}

/** Normalize a ciphertext handle or handle-like bigint into canonical 32-byte hex. */
export function normalizeHandle(handle: string | bigint): Handle {
  if (typeof handle === "bigint") {
    return toHex(handle, { size: 32 }) as Handle;
  }
  if (!isHex(handle)) {
    throw new TypeError(`Handle must be a hex string or bigint, got: ${handle}`);
  }
  return toHex(hexToBigInt(handle), { size: 32 }) as Handle;
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
