import { type Hex } from "viem";

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

export function assertString<T>(value: T, context: string): asserts value is T {
  if (typeof value !== "string") {
    throw new TypeError(`${context} must be a string, got ${typeof value}`);
  }
}

export function assertArray<T>(value: T, context: string): asserts value is T {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array, got ${typeof value}`);
  }
}

export function assertFunction<T>(value: T, context: string): asserts value is T {
  if (typeof value !== "function") {
    throw new TypeError(`${context} must be a function, got ${typeof value}`);
  }
}

/** Assert that `obj[key]` is a string. Narrows `obj` to include `{ [key]: string }`. */
export function assertStringProp<
  K extends string,
  O extends Record<string, unknown> = Record<string, unknown>,
>(obj: O, key: K, context: string): asserts obj is O & Record<K, string> {
  assertString(obj[key], context);
}

/** Assert that `obj[key]` is a function. Narrows `obj` to include `{ [key]: F }`. */
export function assertFunctionProp<
  K extends string,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  F extends Function,
  O extends Record<string, unknown> = Record<string, unknown>,
>(obj: O, key: K, context: string): asserts obj is O & Record<K, F> {
  assertFunction(obj[key], context);
}

export function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new TypeError(message);
  }
}

// ── Environment detection ────────────────────────────────────

/**
 * Subset of the WebExtensions `runtime` API used by the SDK.
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime
 */
export interface BrowserExtensionRuntime {
  /** The ID of the extension. */
  id: string;
  /** Convert a relative path within the extension to a fully-qualified URL. */
  getURL: (path: string) => string;
}

/**
 * Return the browser extension runtime object, or `undefined` outside extensions.
 * Works across Chrome/Edge (`chrome.runtime`) and Firefox/Safari (`browser.runtime`).
 * Extensions have restricted CSP that blocks `blob:` URLs, so callers use
 * this to detect the environment and resolve file URLs via `runtime.getURL`.
 */
export function getBrowserExtensionRuntime(): BrowserExtensionRuntime | undefined {
  try {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const ns of [g.chrome, g.browser]) {
      assertObject(ns, "ns");
      const { runtime } = ns;
      assertObject(runtime, "runtime");
      assertStringProp(runtime, "id", "runtime.id");
      assertFunctionProp<"getURL", (path: string) => string>(runtime, "getURL", "runtime.getURL");
      return runtime;
    }
  } catch {
    // Not in an extension context
  }
  return undefined;
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
