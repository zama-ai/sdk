import { assertFunctionProp, assertObject, assertStringProp } from "../utils/assertions";

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

function isValidRuntime(runtime: unknown): runtime is BrowserExtensionRuntime {
  try {
    assertObject(runtime, "runtime");
    assertStringProp(runtime, "id", "runtime.id");
    assertFunctionProp<"getURL", (path: string) => string>(runtime, "getURL", "runtime.getURL");
    return true;
  } catch {
    return false;
  }
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
      if (isValidRuntime(ns.runtime)) {
        return ns.runtime;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}
