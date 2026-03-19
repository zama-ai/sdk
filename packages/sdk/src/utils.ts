import type { Hex } from "viem";

/** Coerce an unknown caught value to an Error instance. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Normalize a un-prefixed hex payload to a 0x-prefixed `Hex` value. */
export function prefixHex(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

/** Convert a public `Hex` value back an unprefixed format. */
export function unprefixHex(value: Hex): string {
  assertCondition(value.startsWith("0x"), `Expected 0x-prefixed hex, got: ${value}`);
  return value.slice(2);
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
  fns: (() => Promise<T>)[],
  maxConcurrency = Infinity,
): Promise<T[]> {
  if (!Number.isFinite(maxConcurrency) || maxConcurrency >= fns.length) {
    return Promise.all(fns.map((f) => f()));
  }

  const results: T[] = Array.from({ length: fns.length });
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
