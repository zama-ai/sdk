import { test, expect } from "./fixtures";

// Exercises the relayer proxy through Playwright's request context, which bypasses the
// page-level abort of /api/relayer/** and hits the dev server directly. Nothing reaches a
// real relayer: rejected cases stop at the proxy, and mainnet's upstream is unreachable.
test.describe("relayer proxy", () => {
  test("lists the networks the server can serve", async ({ request }) => {
    const { enabled } = (await (await request.get("/api/networks")).json()) as {
      enabled: string[];
    };
    expect(enabled).toContain("sepolia"); // public testnet relayer by default
    expect(enabled).toContain("bnb-testnet"); // cleartext: no relayer needed
    expect(enabled).toContain("mainnet"); // MAINNET_RELAYER_URL set in playwright.config.ts
    expect(enabled).not.toContain("polygon"); // POLYGON_RELAYER_URL unset
  });

  test("rejects a network without a configured relayer", async ({ request }) => {
    const res = await request.post("/api/relayer/polygon/v2/keyurl");
    expect(res.status()).toBe(404);
  });

  test("rejects an unknown network", async ({ request }) => {
    const res = await request.post("/api/relayer/nope/v2/keyurl");
    expect(res.status()).toBe(404);
  });

  test("rejects a relayer route the SDK does not use", async ({ request }) => {
    const res = await request.post("/api/relayer/sepolia/admin");
    expect(res.status()).toBe(404);
  });

  // Mainnet's upstream in playwright.config.ts is unreachable, so an allowed route is
  // forwarded and comes back 503, while a rejected one never leaves the proxy (404).
  test("forwards the job polling path of an async relayer call", async ({ request }) => {
    const poll = await request.get(
      "/api/relayer/mainnet/v2/user-decrypt/ae7748df-dcb1-41f8-83f6-ac828841dc43",
    );
    expect(poll.status()).toBe(503);
    const nested = await request.get("/api/relayer/mainnet/v2/user-decrypt/x/y");
    expect(nested.status()).toBe(404);
  });

  test("rejects requests from a foreign origin", async ({ request }) => {
    const res = await request.post("/api/relayer/sepolia/v2/keyurl", {
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
  });
});
