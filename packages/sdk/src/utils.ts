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

/** Assert that `obj[key]` is a string. Narrows `obj` to include `{ [key]: string }`. */
export function assertStringProp<
  K extends string,
  O extends Record<string, unknown> = Record<string, unknown>,
>(obj: O, key: K, context: string): asserts obj is O & Record<K, string> {
  assertString(obj[key], context);
}

export function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new TypeError(message);
  }
}
