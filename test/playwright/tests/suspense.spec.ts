import { test, expect } from "../fixtures";

test("should resolve every suspense query variant behind one boundary", async ({
  page,
  contracts,
}) => {
  await page.goto(`/suspense?token=${contracts.cUSDT}&erc20=${contracts.USDT}`);

  // All seven suspense queries resolve together once the boundary lifts
  await expect(page.getByTestId("suspense-symbol")).toHaveText("cUSDT");
  await expect(page.getByTestId("suspense-total-supply")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("suspense-is-confidential")).toHaveText("true");
  await expect(page.getByTestId("suspense-is-wrapper")).toHaveText("true");
  // ERC-7984: the holder is implicitly their own operator (holder == spender)
  await expect(page.getByTestId("suspense-is-operator")).toHaveText("true");
  await expect(page.getByTestId("suspense-allowance")).toHaveText(/^\d+$/);
  // Registry lookup discovers the wrapper for the underlying ERC-20
  await expect(page.getByTestId("suspense-wrapper-discovery")).toHaveText(
    new RegExp(contracts.cUSDT, "i"),
  );
});
