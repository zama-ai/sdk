/**
 * Computes the SHA-384 hash of the installed @zama-fhe/relayer-sdk UMD bundle
 * and updates RELAYER_SDK_UMD_INTEGRITY in worker.constants.ts.
 *
 * Usage: pnpm --filter @zama-fhe/sdk update-relayer-sdk-umd-hash
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const UMD_FILENAME = "relayer-sdk-js.umd.cjs";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("@zama-fhe/relayer-sdk/package.json");
const umdPath = resolve(dirname(pkgPath), "bundle", UMD_FILENAME);

const umdSource = readFileSync(umdPath);
const newHash = createHash("sha384").update(umdSource).digest("hex");

const constantsPath = resolve(import.meta.dirname, "../src/worker/worker.constants.ts");
const contents = readFileSync(constantsPath, "utf-8");

const updated = contents.replace(
  /export const RELAYER_SDK_UMD_INTEGRITY\s*=\s*\n?\s*"[a-f0-9]+";/,
  `export const RELAYER_SDK_UMD_INTEGRITY =\n  "${newHash}";`,
);

if (updated === contents) {
  process.stdout.write(`Hash already up to date: ${newHash}\n`);
} else {
  writeFileSync(constantsPath, updated);
  process.stdout.write(`Updated RELAYER_SDK_UMD_INTEGRITY to: ${newHash}\n`);
}
