import { build, type Plugin } from "rolldown";
import { dirname, resolve } from "node:path";

const INLINE_SUFFIX = "?inline";

/**
 * Bundles `<path>?inline` imports as IIFE and exposes the code as a default string export.
 * The source file is resolved relative to the importer — no pre-build step needed.
 */
export function inline({ tsconfig }: { tsconfig: string }): Plugin {
  return {
    name: "inline-plugin",
    resolveId(source, importer) {
      if (!source.endsWith(INLINE_SUFFIX)) return null;
      const filePath = source.slice(0, -INLINE_SUFFIX.length);
      const resolved = importer ? resolve(dirname(importer), filePath) : resolve(filePath);
      return `\0${resolved}${INLINE_SUFFIX}`;
    },
    async load(id) {
      if (!id.startsWith("\0") || !id.endsWith(INLINE_SUFFIX)) return null;
      const filePath = id.slice(1, -INLINE_SUFFIX.length);
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
