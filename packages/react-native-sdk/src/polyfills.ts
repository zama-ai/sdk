/**
 * Side-effect import that polyfills every JS/Web API the Zama SDK relies on
 * but which is missing from React Native's Hermes engine.
 *
 * Import this once, as the **very first import** in your entry file, before
 * any SDK code runs:
 *
 * ```ts
 * import "@zama-fhe/react-native-sdk/polyfills";
 * ```
 *
 * Hermes hoists ES `import` statements above top-level code, so anything you
 * place after this import may execute before the polyfills land. Always make
 * this the first line of your entry file (or wire it via Metro's
 * `getModulesRunBeforeMainModule`).
 *
 * Polyfills installed:
 * - `crypto.subtle` and `crypto.getRandomValues` (via `react-native-quick-crypto`)
 * - `Array.prototype.toSorted` (ES2023)
 * - `Set.prototype.isSubsetOf`  (ES2025)
 *
 * Required peer dependencies (install in the host app):
 *   `npx expo install react-native-quick-crypto`
 *
 * **Custom dev client only.** `react-native-quick-crypto` ships native
 * modules (BoringSSL/OpenSSL) that Expo Go cannot load. Run
 * `npx expo prebuild` and use `npx expo run:ios|android` (or EAS Build).
 *
 * @packageDocumentation
 */

// Use CommonJS `require` rather than `import` because:
//   1. Hermes hoists ES `import` above top-level code, breaking the ordering
//      guarantees this file is supposed to provide.
//   2. The native peer is resolved at runtime, not via the bundled type graph.
declare const require: (id: string) => unknown;

// --- crypto.subtle + crypto.getRandomValues ------------------------------
// `react-native-quick-crypto.install()` populates the entire `globalThis.crypto`
// object (subtle, getRandomValues, randomUUID, etc.) via JSI bindings to
// BoringSSL. We only call install() if subtle is missing, so a previously
// installed implementation isn't clobbered.
let quickCrypto: { install?: () => void };
try {
  quickCrypto = require("react-native-quick-crypto") as typeof quickCrypto;
} catch (cause) {
  throw new Error(
    `@zama-fhe/react-native-sdk/polyfills: missing peer dependency ` +
      `"react-native-quick-crypto". Install it in your app: ` +
      `\`npx expo install react-native-quick-crypto\` and rebuild your dev client ` +
      `(\`npx expo prebuild\`). Expo Go cannot load native modules.`,
    { cause },
  );
}

if (typeof quickCrypto.install !== "function") {
  throw new TypeError(
    "@zama-fhe/react-native-sdk/polyfills: react-native-quick-crypto " +
      "does not expose install(). Upgrade to a version that does.",
  );
}

const globalSubtle = (globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle;
if (!globalSubtle) {
  quickCrypto.install();
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
