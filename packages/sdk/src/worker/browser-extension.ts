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

function isValidRuntime(obj: unknown): obj is BrowserExtensionRuntime {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    typeof (obj as Record<string, unknown>).id === "string" &&
    "getURL" in obj &&
    typeof (obj as Record<string, unknown>).getURL === "function"
  );
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
    if (typeof ns !== "object" || ns === null || !("runtime" in ns)) {continue;}
    const { runtime } = ns as Record<string, unknown>;
    if (isValidRuntime(runtime)) {return runtime;}
  }
  return undefined;
}
