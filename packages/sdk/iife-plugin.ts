import { build, type Plugin } from "rolldown";
import { dirname, resolve } from "node:path";

const IIFE_SUFFIX = "?iife";

/**
 * Bundles `<path>?iife` imports as IIFE and exposes the code as a default string export.
 * The source file is resolved relative to the importer — no pre-build step needed.
 */
export function iife({ tsconfig }: { tsconfig: string }): Plugin {
  return {
    name: "iife-plugin",
    resolveId(source, importer) {
      if (!source.endsWith(IIFE_SUFFIX)) return null;
      const filePath = source.slice(0, -IIFE_SUFFIX.length);
      const resolved = importer ? resolve(dirname(importer), filePath) : resolve(filePath);
      return `\0${resolved}${IIFE_SUFFIX}`;
    },
    async load(id) {
      if (!id.startsWith("\0") || !id.endsWith(IIFE_SUFFIX)) return null;
      const filePath = id.slice(1, -IIFE_SUFFIX.length);
      const result = await build({
        input: filePath,
        output: { format: "iife" },
        write: false,
        resolve: { tsconfigFilename: tsconfig },
        platform: "browser",
        treeshake: true,
      });
      return `export default ${JSON.stringify(result.output[0].code)};`;
    },
  };
}
