import type { Plugin } from "rolldown";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { RELAYER_SDK_VERSION } from "./src/worker/worker.constants";

/**
 * Verifies the installed @zama-fhe/relayer-sdk version matches the pinned
 * CDN version at build time.
 *
 * The UMD bundle is fetched from cdn.zama.org at runtime and verified with
 * SHA-384 inside the worker. This plugin catches version drift early — if
 * the installed npm version doesn't match the pinned CDN version, the build
 * fails with instructions to run the update script.
 */
export function relayerSdkCdn(): Plugin {
  return {
    name: "relayer-sdk-cdn-plugin",
    buildStart() {
      const require = createRequire(import.meta.url);

      let pkgPath: string;
      try {
        pkgPath = require.resolve("@zama-fhe/relayer-sdk/package.json");
      } catch (error) {
        throw new Error(
          `relayer-sdk-cdn-plugin: Failed to resolve @zama-fhe/relayer-sdk.\n` +
            `Ensure @zama-fhe/relayer-sdk is installed.`,
          { cause: error },
        );
      }

      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.version !== RELAYER_SDK_VERSION) {
        throw new Error(
          `relayer-sdk-cdn-plugin: Version mismatch for @zama-fhe/relayer-sdk.\n` +
            `  Expected: ${RELAYER_SDK_VERSION}\n` +
            `  Installed: ${pkg.version}\n\n` +
            `Run: pnpm --filter @zama-fhe/sdk update-relayer-sdk-cdn-version`,
        );
      }
    },
  };
}
