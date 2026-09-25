import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { iifeStub, sharedResolve } from "../../vitest.shared.mjs";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [iifeStub()],
  resolve: sharedResolve,
  test: { name: "sdk-daemon", include: ["test/**/*.test.ts"], environment: "node" },
});
