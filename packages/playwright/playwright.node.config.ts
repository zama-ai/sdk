import { defineConfig } from "@playwright/test";
import type { NodeWorkerFixtures } from "./fixtures/node-test";
import { NODE_ANVIL_PORT, MOCK_RELAYER_PORT } from "./fixtures/constants";

export default defineConfig<{}, NodeWorkerFixtures>({
  tsconfig: "./tsconfig.node.json",
  testDir: "./tests/node",
  outputDir: "./test-results/node/",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
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
    {
      command: `npx tsx --tsconfig tsconfig.node.json start-mock-relayer.ts ${MOCK_RELAYER_PORT} ${NODE_ANVIL_PORT}`,
      name: "mock-relayer",
      wait: {
        stdout: /Mock relayer ready on port (\d+)/,
      },
      timeout: 30_000,
    },
  ],
});
