/// <reference types="node" />
// Playwright config for the verify-sdk-test-app skill. Run it through `scripts/verify.sh run`,
// which sets the VERIFY_* variables from the running instance.
//
// No imports on purpose: this file lives outside the @zama-fhe/playwright package, so it cannot
// resolve @playwright/test. The specs import the repo fixtures, which resolve it from
// test/playwright/node_modules, the same copy the CLI runs from.

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Run specs through scripts/verify.sh run.`);
  }
  return value;
};

const skillDir = env("VERIFY_SKILL_DIR");
const repoRoot = env("VERIFY_REPO_ROOT");
const evidenceDir = env("VERIFY_EVIDENCE_DIR");

export default {
  outputDir: `${evidenceDir}/artifacts`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: `${evidenceDir}/report.json` }],
    ["html", { outputFolder: `${evidenceDir}/html`, open: "never" }],
  ],
  use: {
    baseURL: env("VERIFY_BASE_URL"),
    // Worker option declared by test/playwright/fixtures/test.ts.
    anvilPort: Number(env("VERIFY_ANVIL_PORT")),
    channel: process.env.VERIFY_BROWSER_CHANNEL ?? "chrome",
    viewport: { width: 1280, height: 800 },
    screenshot: "on",
    trace: "on",
    video: "on",
  },
  projects: [
    // Evidence-first journeys shipped with this skill (one per feature-map file).
    { name: "journeys", testDir: `${skillDir}/journeys` },
    // The repo's own hermetic E2E specs, pointed at this instance.
    {
      name: "repo",
      testDir: `${repoRoot}/test/playwright/tests`,
      testIgnore: ["**/node/**", "**/*.node.spec.ts", "**/*-live.spec.ts"],
    },
  ],
};
