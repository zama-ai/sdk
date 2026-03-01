import { test, expect } from "../fixtures/test";

test("worker loads without SyntaxError in Vite ESM environment", async ({ page, contracts }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  // Navigate to shield page and trigger a shield operation (exercises the worker)
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  // Wait for the shield transaction to succeed (proves the worker round-tripped)
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x", {
    timeout: 30000,
  });

  // No SyntaxError in console — this is the IIFE fix validation
  const syntaxErrors = errors.filter((e) => e.includes("SyntaxError"));
  expect(syntaxErrors).toHaveLength(0);
});
