import { test, expect, MOCK_CTOKEN1_ADDRESS, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

test.describe("security headers", () => {
  test("serves the page under a nonce-based CSP", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic' 'wasm-unsafe-eval'/,
    );
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // Only `next dev` needs eval and inline styles; CI runs the build.
    if (process.env.CI) {
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toContain("'unsafe-inline'");
    }
    // A page path that merely starts with "api" is still a page.
    const notFound = await request.get("/api-docs");
    expect(notFound.headers()["content-security-policy"]).toContain("default-src 'self'");
  });

  test("sets the static headers on pages and API responses", async ({ request }) => {
    for (const path of ["/", "/api/networks"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe("no-referrer");
      expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
      expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    }
  });

  // Covers the page load, wallet connect and the RPC reads behind the token list. Encryption
  // is not covered: every relayer call is aborted in this suite, so the key download, WASM
  // compile and encrypt worker never run. Check those by hand with a wallet on Sepolia.
  test("the app runs without CSP violations", async ({
    page,
    mockRpc,
    mockWallet,
    cspViolations,
  }) => {
    await mockRpc();
    await mockWallet({
      accounts: [],
      chainId: SEPOLIA_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByRole("combobox", { name: "Confidential token" })).toHaveValue(
      MOCK_CTOKEN1_ADDRESS,
    );

    expect(await cspViolations()).toEqual([]);
  });
});

test.describe("footer", () => {
  test("links the source repository and the deployed commit", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Source code" })).toHaveAttribute(
      "href",
      "https://github.com/zama-ai/sdk",
    );
    await expect(footer.getByRole("link", { name: "Commit 0123456" })).toHaveAttribute(
      "href",
      "https://github.com/zama-ai/sdk/commit/0123456789abcdef0123456789abcdef01234567",
    );
  });
});
