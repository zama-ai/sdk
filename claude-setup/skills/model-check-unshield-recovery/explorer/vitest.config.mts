// Kept apart from the root vitest projects, so `pnpm test` does not run it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { iifeStub, sharedResolve } from "../../../../vitest.shared.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

export default defineConfig({
  root: repoRoot,
  plugins: [iifeStub()],
  test: {
    name: "unshield-recovery-explorer",
    environment: "node",
    include: [path.join(path.relative(repoRoot, here), "*.test.ts")],
    testTimeout: 120_000,
    // Print the report for passing runs too.
    reporters: ["verbose"],
  },
  resolve: sharedResolve,
});
