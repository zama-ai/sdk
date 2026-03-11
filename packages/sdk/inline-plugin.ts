import type { Plugin } from "rolldown";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INLINE_SUFFIX = "?inline";

/**
 * Resolves `<path>?inline` imports to the string contents of the built file in `dist/`.
 * The referenced workers must be built before the main bundle (place their config first).
 */
export function inline(): Plugin {
  const cache = new Map<string, string>();
  return {
    name: "inline-plugin",
    resolveId(source) {
      if (source.endsWith(INLINE_SUFFIX)) return `\0${source}`;
      return null;
    },
    load(id) {
      if (!id.startsWith("\0") || !id.endsWith(INLINE_SUFFIX)) return null;
      const name = id.slice(1, -INLINE_SUFFIX.length);
      let code = cache.get(name);
      if (!code) {
        const workerPath = resolve(`dist/${name}`);
        try {
          code = readFileSync(workerPath, "utf-8");
        } catch {
          throw new Error(`Cannot read ${workerPath}. File must be built before the main bundle.`);
        }
        cache.set(name, code);
      }
      return `export default ${JSON.stringify(code)};`;
    },
  };
}
