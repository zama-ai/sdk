import { build, type Plugin } from "rolldown";
import { basename, dirname, resolve } from "node:path";

const IIFE_SUFFIX = "?iife";

/**
 * Bundles `<path>?iife` imports as IIFE and emits the result as a standalone
 * asset file. Exports only the `filename` so the consumer can reference it
 * at runtime via `new URL(filename, import.meta.url)`.
 */
export function iife({ tsconfig }: { tsconfig: string }): Plugin {
  return {
    name: "iife-plugin",
    resolveId(source, importer) {
      if (!source.endsWith(IIFE_SUFFIX)) {
        return null;
      }
      const filePath = source.slice(0, -IIFE_SUFFIX.length);
      const resolved = importer ? resolve(dirname(importer), filePath) : resolve(filePath);
      return `\0${resolved}${IIFE_SUFFIX}`;
    },
    async load(id) {
      if (!id.startsWith("\0") || !id.endsWith(IIFE_SUFFIX)) {
        return null;
      }
      const filePath = id.slice(1, -IIFE_SUFFIX.length);
      const result = await build({
        input: filePath,
        output: { format: "iife" },
        write: false,
        resolve: { tsconfigFilename: tsconfig },
        platform: "browser",
        treeshake: true,
      });
      const code = result.output[0].code;

      // Emit the worker as a standalone file (e.g. relayer-sdk.worker.js)
      // for environments that cannot use blob: URLs (browser extensions).
      const filename = basename(filePath).replace(/\.ts$/, ".js");
      this.emitFile({ type: "asset", fileName: filename, source: code });

      return `export const filename = ${JSON.stringify(filename)};`;
    },
  };
}
