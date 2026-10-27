import { test, expect } from "@playwright/test";

// The allowlist is read once when the relayer table loads, and the dev server under test
// runs with it unset, so these tests load the module in this process instead.
function loadRelayers(env: Record<string, string>) {
  Object.assign(process.env, env);
  const modulePath = require.resolve("../src/lib/relayers");
  delete require.cache[modulePath];
  return require(modulePath) as typeof import("../src/lib/relayers");
}

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

  test("fails at startup on an unknown key", () => {
    expect(() => loadRelayers({ ENABLED_NETWORKS: "mainet" })).toThrow(/unknown keys: mainet/);
  });
});
