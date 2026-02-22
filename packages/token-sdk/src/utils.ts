import type { Address } from "./relayer/relayer-sdk.types";

/** Convert a Uint8Array to a hex string prefixed with `0x`. */
export function toHex(bytes: Uint8Array): Address {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

// ── Runtime type assertion helpers ───────────────────────────

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
