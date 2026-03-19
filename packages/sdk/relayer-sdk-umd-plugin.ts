import type { Plugin } from "rolldown";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { RELAYER_SDK_UMD_FILENAME } from "./src/worker/worker.constants";

/**
 * Copies the @zama-fhe/relayer-sdk UMD bundle into the build output so the
 * web worker can load it via `importScripts` at runtime (no CDN dependency).
 *
 * The UMD file is resolved from `node_modules` at build time — its version
 * is pinned by the `@zama-fhe/relayer-sdk` dependency in package.json.
 */
export function relayerSdkUmd(): Plugin {
  return {
    name: "relayer-sdk-umd-plugin",
    buildStart() {
      let umdSource: string;
      try {
        const require = createRequire(import.meta.url);
        const pkgPath = require.resolve("@zama-fhe/relayer-sdk/package.json");
        const umdPath = resolve(dirname(pkgPath), "bundle", RELAYER_SDK_UMD_FILENAME);
        umdSource = readFileSync(umdPath, "utf-8");
      } catch (error) {
        throw new Error(
          `relayer-sdk-umd-plugin: Failed to read the relayer-sdk UMD bundle.\n` +
            `Ensure @zama-fhe/relayer-sdk is installed and contains bundle/${RELAYER_SDK_UMD_FILENAME}.`,
          { cause: error },
        );
      }
      this.emitFile({
        type: "asset",
        fileName: RELAYER_SDK_UMD_FILENAME,
        source: umdSource,
      });
    },
  };
}
