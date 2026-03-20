/**
 * Fetches the @zama-fhe/relayer-sdk UMD bundle from CDN, computes its SHA-384
 * hash, and updates RELAYER_SDK_UMD_INTEGRITY and RELAYER_SDK_VERSION in
 * worker.constants.ts.
 *
 * The hash is computed from the CDN copy (not the npm copy) because that's
 * what the worker fetches at runtime for integrity verification.
 *
 * Usage: pnpm --filter @zama-fhe/sdk update-relayer-sdk-cdn-version
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const UMD_FILENAME = "relayer-sdk-js.umd.cjs";
const CDN_BASE = "https://cdn.zama.org/relayer-sdk-js";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("@zama-fhe/relayer-sdk/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const newVersion: string = pkg.version;

const cdnUrl = `${CDN_BASE}/${newVersion}/${UMD_FILENAME}`;
process.stdout.write(`Fetching ${cdnUrl} ...\n`);

const response = await fetch(cdnUrl);
if (!response.ok) {
  process.stderr.write(`Failed to fetch CDN bundle: ${response.status} ${response.statusText}\n`);
  process.exit(1);
}

const cdnBundle = Buffer.from(await response.arrayBuffer());
const newHash = createHash("sha384").update(cdnBundle).digest("hex");

const constantsPath = resolve(import.meta.dirname, "../src/worker/worker.constants.ts");
let contents = readFileSync(constantsPath, "utf-8");

// Update hash
contents = contents.replace(
  /export const RELAYER_SDK_UMD_INTEGRITY\s*=\s*\n?\s*"[a-f0-9]+";/,
  `export const RELAYER_SDK_UMD_INTEGRITY =\n  "${newHash}";`,
);

// Update version
contents = contents.replace(
  /export const RELAYER_SDK_VERSION\s*=\s*"[^"]+";/,
  `export const RELAYER_SDK_VERSION = "${newVersion}";`,
);

writeFileSync(constantsPath, contents);
process.stdout.write(`Updated RELAYER_SDK_VERSION to: ${newVersion}\n`);
process.stdout.write(`Updated RELAYER_SDK_UMD_INTEGRITY to: ${newHash}\n`);
