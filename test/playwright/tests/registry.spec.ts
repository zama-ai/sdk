import { test, expect } from "../fixtures";

test("should enumerate registry pairs and resolve lookups in both directions", async ({
  page,
  contracts,
}) => {
  await page.goto(`/registry?token=${contracts.USDT}&confidentialToken=${contracts.cUSDT}`);

  // The registry address is resolved from the chain config
  await expect(page.getByTestId("registry-address")).toContainText("Registry: 0x");

  // All three deployed pairs are registered (cUSDC, cUSDT, cERC1363)
  await expect(page.getByTestId("registry-pairs-length")).toHaveText("Total pairs: 3");
  const pairs = page.getByTestId("registry-pair");
  await expect(pairs).toHaveCount(3);
  await expect(pairs.filter({ hasText: new RegExp(contracts.cUSDT, "i") })).toHaveCount(1);
  await expect(pairs.filter({ hasText: new RegExp(contracts.cUSDC, "i") })).toHaveCount(1);

  // Unpaginated full enumeration agrees with the paginated one
  await expect(page.getByTestId("registry-all-pairs-count")).toHaveText("All pairs: 3");

  // Single-pair lookup by index
  await expect(page.getByTestId("registry-pair-at-index")).toContainText("Pair #0: 0x");

  // Slice with an exclusive upper bound returns exactly one pair
  await expect(page.getByTestId("registry-pairs-slice-count")).toHaveText("Slice [0, 1): 1");

  // Forward lookup: underlying → confidential
  await expect(page.getByTestId("registry-confidential-lookup")).toContainText(
    new RegExp(contracts.cUSDT, "i"),
  );

  // Reverse lookup: confidential → underlying
  await expect(page.getByTestId("registry-token-lookup")).toContainText(
    new RegExp(contracts.USDT, "i"),
  );

  // Validity check for a registered confidential token
  await expect(page.getByTestId("registry-is-valid")).toHaveText(
    "Is valid confidential token: true",
  );
});

test("should report an unregistered contract as an invalid confidential token", async ({
  page,
  contracts,
}) => {
  // The plain ERC-20 is not a registered confidential token
  await page.goto(`/registry?token=${contracts.USDT}&confidentialToken=${contracts.USDT}`);

  await expect(page.getByTestId("registry-is-valid")).toHaveText(
    "Is valid confidential token: false",
  );
});
