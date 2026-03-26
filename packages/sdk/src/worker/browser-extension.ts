import { assertObject, assertStringProp } from "../utils";

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function assertFunction(value: unknown, context: string): asserts value is Function {
  if (typeof value !== "function") {
    throw new TypeError(`${context} must be a function, got ${typeof value}`);
  }
}

function assertFunctionProp<
  K extends string,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  F extends Function,
  O extends Record<string, unknown> = Record<string, unknown>,
>(obj: O, key: K, context: string): asserts obj is O & Record<K, F> {
  assertFunction(obj[key], context);
}

/**
 * Return the browser extension runtime object, or `undefined` outside extensions.
 * Works across Chrome/Edge (`chrome.runtime`) and Firefox/Safari (`browser.runtime`).
 * Extensions have restricted CSP that blocks `blob:` URLs, so callers use
 * this to detect the environment and resolve file URLs via `runtime.getURL`.
 */
export function getBrowserExtensionRuntime(): BrowserExtensionRuntime | undefined {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const ns of [g.chrome, g.browser]) {
    try {
      assertObject(ns, "ns");
      const { runtime } = ns;
      assertObject(runtime, "runtime");
      assertStringProp(runtime, "id", "runtime.id");
      assertFunctionProp<"getURL", (path: string) => string>(runtime, "getURL", "runtime.getURL");
      return runtime;
    } catch {
      continue;
    }
  }
  return undefined;
}
