import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { name: "sdk-sidecar", include: ["test/**/*.test.ts"], environment: "node" },
});
