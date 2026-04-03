import { defineConfig } from "@playwright/test";
import type { NodeWorkerFixtures } from "./fixtures/node-test";
import { NODE_ANVIL_PORT } from "./fixtures/constants";

const CI = !!process.env.CI;

export default defineConfig<{}, NodeWorkerFixtures>({
  tsconfig: "./tsconfig.node.json",
  globalSetup: ["./fixtures/node-global-setup.ts"],
  testDir: "./tests/node",
  testMatch: ["**/node/**", "**/*.node.spec.ts"],
  outputDir: "./test-results/node/",
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: 1,
  reporter: CI ? "github" : "list",
  expect: {
    timeout: 10000,
  },
  projects: [
    {
      name: "node",
      use: {
        anvilPort: NODE_ANVIL_PORT,
      },
      timeout: 60000,
    },
  ],
  webServer: [
    {
      command: `./start-anvil.sh ${NODE_ANVIL_PORT}`,
      name: "anvil-node",
      wait: {
        stdout: /Anvil ready on port (\d+)/,
      },
      timeout: 60_000,
    },
  ],
});
