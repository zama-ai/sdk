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
    name: "unshield-recovery-replay",
    environment: "node",
    include: [path.join(path.relative(repoRoot, here), "*.test.ts")],
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: sharedResolve,
});
