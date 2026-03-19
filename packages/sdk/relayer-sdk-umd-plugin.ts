import type { Plugin } from "rolldown";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { RELAYER_SDK_UMD_FILENAME, RELAYER_SDK_UMD_INTEGRITY } from "./src/worker/worker.constants";

/**
 * Copies the @zama-fhe/relayer-sdk UMD bundle into the build output so the
 * web worker can load it via `importScripts` at runtime (no CDN dependency).
 *
 * The UMD file is resolved from `node_modules` at build time — its version
 * is pinned by the `@zama-fhe/relayer-sdk` dependency in package.json.
 *
 * A SHA-384 integrity check runs at build time to guard against supply-chain
 * tampering (compromised registry, malicious postinstall, poisoned lockfile).
 * If the hash doesn't match, the build fails with instructions to update it.
 */
export function relayerSdkUmd(): Plugin {
  return {
    name: "relayer-sdk-umd-plugin",
    buildStart() {
      let umdSource: Buffer;
      try {
        const require = createRequire(import.meta.url);
        const pkgPath = require.resolve("@zama-fhe/relayer-sdk/package.json");
        const umdPath = resolve(dirname(pkgPath), "bundle", RELAYER_SDK_UMD_FILENAME);
        umdSource = readFileSync(umdPath);
      } catch (error) {
        throw new Error(
          `relayer-sdk-umd-plugin: Failed to read the relayer-sdk UMD bundle.\n` +
            `Ensure @zama-fhe/relayer-sdk is installed and contains bundle/${RELAYER_SDK_UMD_FILENAME}.`,
          { cause: error },
        );
      }

      const actualHash = createHash("sha384").update(umdSource).digest("hex");
      if (actualHash !== RELAYER_SDK_UMD_INTEGRITY) {
        throw new Error(
          `relayer-sdk-umd-plugin: SHA-384 integrity check failed for ${RELAYER_SDK_UMD_FILENAME}.\n` +
            `  Expected: ${RELAYER_SDK_UMD_INTEGRITY}\n` +
            `  Actual:   ${actualHash}\n\n` +
            `The installed UMD bundle does not match the expected hash.\n` +
            `If you intentionally bumped @zama-fhe/relayer-sdk, run:\n` +
            `  pnpm --filter @zama-fhe/sdk update-relayer-sdk-umd-hash`,
        );
      }

      this.emitFile({
        type: "asset",
        fileName: RELAYER_SDK_UMD_FILENAME,
        source: umdSource.toString("utf-8"),
      });
    },
  };
}
