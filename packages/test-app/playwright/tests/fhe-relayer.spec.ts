import { test, expect } from "../fixtures/test";

test("should generate keypair", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);
  await page.getByTestId("generate-keypair-button").click();

  await expect(page.getByTestId("generate-keypair-result")).toContainText("Public key length:");
  await expect(page.getByTestId("generate-keypair-result")).not.toContainText("length: 0");
});

test("should generate keypair then create EIP-712", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);

  // Generate keypair first
  await page.getByTestId("generate-keypair-button").click();
  await expect(page.getByTestId("generate-keypair-result")).toContainText("Public key length:");

  // Create EIP-712 typed data
  await page.getByTestId("create-eip712-button").click();
  await expect(page.getByTestId("create-eip712-result")).toContainText("EIP-712 created:");
});

test("should get public key", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);

  await expect(page.getByTestId("public-key-result")).toContainText(
    "Public key ID: mock-public-key-id",
  );
});

test("should get public params", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);

  await expect(page.getByTestId("public-params-result")).toContainText(
    "Public params ID: mock-public-params-id",
  );
});

test("should encrypt a value", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);
  await page.getByTestId("encrypt-button").click();

  await expect(page.getByTestId("encrypt-result")).toContainText("Handles count:");
  await expect(page.getByTestId("encrypt-result")).not.toContainText("count: 0");
});
