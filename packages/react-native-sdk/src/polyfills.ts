/**
 * Side-effect import that polyfills the JS/Web APIs the Zama SDK relies on
 * but which are missing from React Native's Hermes engine.
 *
 * Import this once, as early as possible, before any SDK code runs:
 *
 * ```ts
 * import "@zama-fhe/react-native-sdk/polyfills";
 * ```
 *
 * Because Hermes hoists `import` statements above top-level code, the import
 * must be the very first import in your entry file, or wired via Metro's
 * `getModulesRunBeforeMainModule` (a `shims.js` file).
 *
 * Polyfills installed:
 * - `crypto.getRandomValues`   (via `expo-crypto` — Expo Go compatible)
 * - `Array.prototype.toSorted` (ES2023)
 * - `Set.prototype.isSubsetOf` (ES2025)
 *
 * **Not polyfilled here:** `crypto.subtle` (WebCrypto SubtleCrypto). The only
 * production-grade option (`react-native-quick-crypto`) ships native modules
 * that Expo Go cannot load. SDK paths that depend on `crypto.subtle`
 * (credential encryption) require a custom dev client where you can install
 * `react-native-quick-crypto` and call `install()` yourself before importing
 * this file.
 *
 * `expo-crypto` must be installed in the host app and is declared as an
 * optional peer dependency.
 *
 * @packageDocumentation
 */

// Use CommonJS `require` rather than `import` because:
//   1. Hermes hoists ES `import` above top-level code, which would break the
//      ordering guarantees this file is supposed to provide.
//   2. `expo-crypto` is an optional peer dep without bundled types in this
//      workspace, so a static `import` would fail typecheck.
declare const require: (id: string) => unknown;

// --- crypto.getRandomValues ----------------------------------------------
// `expo-crypto` exposes a WebCrypto-conformant `getRandomValues(typedArray)`.
// We attach it to `globalThis.crypto` only if the environment doesn't already
// provide one (e.g. a dev client with `react-native-get-random-values`
// already loaded).
let expoCrypto: { getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T };
try {
  expoCrypto = require("expo-crypto") as typeof expoCrypto;
} catch (cause) {
  throw new Error(
    `@zama-fhe/react-native-sdk/polyfills: missing peer dependency "expo-crypto". ` +
      `Install it in your app: \`npx expo install expo-crypto\`.`,
    { cause },
  );
}

const globalCrypto = (globalThis as { crypto?: Partial<Crypto> }).crypto;
if (typeof globalCrypto?.getRandomValues !== "function") {
  if (typeof expoCrypto.getRandomValues !== "function") {
    throw new TypeError(
      "@zama-fhe/react-native-sdk/polyfills: expo-crypto does not expose " +
        "getRandomValues. Upgrade expo-crypto to a version that supports it.",
    );
  }
  // Build (or extend) a `crypto` object on the global with getRandomValues.
  const next: Partial<Crypto> = globalCrypto ? { ...globalCrypto } : {};
  next.getRandomValues = expoCrypto.getRandomValues as Crypto["getRandomValues"];
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: next,
  });
}

// --- Array.prototype.toSorted (ES2023) -----------------------------------
if (typeof (Array.prototype as { toSorted?: unknown }).toSorted !== "function") {
  // oxlint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, "toSorted", {
    configurable: true,
    writable: true,
    value: function toSorted<T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
      // oxlint-disable-next-line unicorn/no-array-sort
      return this.slice().sort(compareFn);
    },
  });
}

// --- Set.prototype.isSubsetOf (ES2025) -----------------------------------
interface SetLike<T> {
  readonly size: number;
  has(value: T): boolean;
}

if (typeof (Set.prototype as { isSubsetOf?: unknown }).isSubsetOf !== "function") {
  // oxlint-disable-next-line no-extend-native
  Object.defineProperty(Set.prototype, "isSubsetOf", {
    configurable: true,
    writable: true,
    value: function isSubsetOf<T>(this: Set<T>, other: SetLike<T>): boolean {
      if (this.size > other.size) {
        return false;
      }
      for (const value of this) {
        if (!other.has(value)) {
          return false;
        }
      }
      return true;
    },
  });
}
