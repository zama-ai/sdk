import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

// The allowlist is read once when the relayer table loads, and the server under test
// runs with it unset, so these tests load the module in this process instead.
const saved: Record<string, string | undefined> = {};

function loadRelayers(env: Record<string, string>) {
  for (const key of Object.keys(env)) saved[key] ??= process.env[key];
  Object.assign(process.env, env);
  const modulePath = require.resolve("../src/lib/relayers");
  delete require.cache[modulePath];
  return require(modulePath) as typeof import("../src/lib/relayers");
}

test.afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete saved[key];
  }
});

test.describe("ENABLED_NETWORKS", () => {
  test("restricts the picker list and the proxy to the listed networks", () => {
    const { enabledNetworks, upstreamFor } = loadRelayers({
      ENABLED_NETWORKS: "sepolia",
      MAINNET_RELAYER_URL: "http://127.0.0.1:9",
    });
    expect(enabledNetworks()).toEqual(["sepolia"]);
    // Mainnet has a relayer URL, so only the allowlist keeps it out.
    expect(upstreamFor("mainnet")).toBeUndefined();
    expect(upstreamFor("sepolia")).toBeDefined();
  });

  test("rejects an unknown key", () => {
    expect(() => loadRelayers({ ENABLED_NETWORKS: "mainet" })).toThrow(/unknown keys: mainet/);
  });

  // The instrumentation hook turns that throw into a boot failure. Needs the production build
  // CI makes; `next start` has nothing to run otherwise.
  test("stops `next start` on an unknown key", () => {
    test.skip(!process.env.CI, "needs the production build");
    const result = spawnSync(
      process.execPath,
      [require.resolve("next/dist/bin/next"), "start", "-p", "3005"],
      { env: { ...process.env, ENABLED_NETWORKS: "mainet" }, encoding: "utf8", timeout: 60_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unknown keys: mainet/);
  });
});
