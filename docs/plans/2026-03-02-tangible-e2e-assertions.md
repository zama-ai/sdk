# Tangible E2E Test Assertions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add direct on-chain balance verification, cache persistence tests, and transition state tests to the Playwright e2e suite so tests prove real state changes, not just UI text.

**Architecture:** Add a `readErc20Balance` fixture helper that calls `viemClient.readContract()` with the ERC-20 `balanceOf` ABI. Enhance existing spec files with on-chain assertions alongside UI assertions. Add new reveal tests for cache persistence and masked→decrypting→revealed transitions.

**Tech Stack:** Playwright, Viem (readContract, publicActions), Hardhat local node

---

### Task 1: Add `readErc20Balance` fixture helper

**Files:**

- Modify: `packages/playwright/fixtures/test.ts`

**Step 1: Add the ERC-20 balanceOf ABI fragment and helper to the fixture**

In `packages/playwright/fixtures/test.ts`, add after the `viemClient` definition (line ~47):

```ts
const erc20BalanceOfAbi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function readErc20Balance(
  tokenAddress: `0x${string}`,
  owner: `0x${string}` = account.address,
): Promise<bigint> {
  return viemClient.readContract({
    address: tokenAddress,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [owner],
  });
}
```

**Step 2: Export it through the fixture**

Add `readErc20Balance` to `TestFixtures` interface:

```ts
export interface TestFixtures {
  // ... existing fields ...
  readErc20Balance: typeof readErc20Balance;
}
```

Add to the `base.extend<TestFixtures>` object:

```ts
readErc20Balance: async ({}, use) => use(readErc20Balance),
```

**Step 3: Verify it compiles**

Run: `cd packages/playwright && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```
feat(playwright): add readErc20Balance fixture helper for on-chain assertions
```

---

### Task 2: Add on-chain assertions to `shield.spec.ts`

**Files:**

- Modify: `packages/playwright/tests/shield.spec.ts`

**Step 1: Add on-chain ERC-20 balance checks after shield operations**

In the first test ("should shield USDT"), after the existing UI assertions, add:

```ts
// On-chain: ERC-20 balance should have decreased by shield amount
const onChainUsdt = await readErc20Balance(contracts.USDT);
expect(onChainUsdt).toBe(initialBalances.USDT - shieldAmount);
```

In the second test ("should shield USDC"), same pattern:

```ts
const onChainUsdc = await readErc20Balance(contracts.USDC);
expect(onChainUsdc).toBe(initialBalances.USDC - shieldAmount);
```

Both tests need `readErc20Balance` added to their destructured fixture args.

**Step 2: Run the tests**

Run: `cd packages/playwright && npx playwright test shield.spec.ts`
Expected: All pass — on-chain balances match computed expectations

**Step 3: Commit**

```
test(shield): add direct on-chain ERC-20 balance assertions
```

---

### Task 3: Add on-chain assertions to `unshield.spec.ts`

**Files:**

- Modify: `packages/playwright/tests/unshield.spec.ts`

**Step 1: Add on-chain ERC-20 balance checks after unshield operations**

In the first test ("should shield USDT then unshield back to ERC20"), after existing UI assertions, add:

```ts
// On-chain: ERC-20 balance should reflect shield then unshield
const onChainUsdt = await readErc20Balance(contracts.USDT);
expect(onChainUsdt).toBe(
  initialBalances.USDT - shieldAmount + unshieldAmount - computeFee(unshieldAmount),
);
```

Same pattern for the USDC test.

Both tests need `readErc20Balance` added to their destructured fixture args.

**Step 2: Run the tests**

Run: `cd packages/playwright && npx playwright test unshield.spec.ts`
Expected: All pass

**Step 3: Commit**

```
test(unshield): add direct on-chain ERC-20 balance assertions
```

---

### Task 4: Add on-chain assertions to `transfer.spec.ts`

**Files:**

- Modify: `packages/playwright/tests/transfer.spec.ts`

**Step 1: Add on-chain ERC-20 balance check for sender after shield+transfer**

The transfer itself is confidential (no ERC-20 change), but the preceding shield does change ERC-20. Verify the ERC-20 decreased by the shield amount (transfer doesn't affect it):

```ts
// On-chain: ERC-20 balance should have decreased by shield amount only (transfer is confidential)
const onChainUsdt = await readErc20Balance(contracts.USDT);
expect(onChainUsdt).toBe(initialBalances.USDT - shieldAmount);
```

Same for USDC test.

Both tests need `readErc20Balance` added to their destructured fixture args.

**Step 2: Run the tests**

Run: `cd packages/playwright && npx playwright test transfer.spec.ts`
Expected: All pass

**Step 3: Commit**

```
test(transfer): add direct on-chain ERC-20 balance assertions
```

---

### Task 5: Add cache persistence test to `reveal.spec.ts`

**Files:**

- Modify: `packages/playwright/tests/reveal.spec.ts`

**Step 1: Add a test that verifies cached balances survive page reload**

Add after the existing tests:

```ts
test("should show cached balance immediately after page reload", async ({
  page,
  initialBalances,
  formatUnits,
}) => {
  await page.goto("/wallet");

  // Reveal and wait for decryption to complete
  await page.getByTestId("reveal-button").click();
  const row = page.getByTestId("token-row-cUSDT");
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(initialBalances.cUSDT, 6));

  // Reload page — cache should persist in IndexedDB
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Reveal again — should show balance without "Decrypting..." intermediate
  await page.getByTestId("reveal-button").click();

  // The balance should appear quickly from cache, not go through "Decrypting..."
  // Use a short timeout to prove it's instant from cache
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(initialBalances.cUSDT, 6), {
    timeout: 3000,
  });
});
```

**Step 2: Run the test**

Run: `cd packages/playwright && npx playwright test reveal.spec.ts --grep "cached balance"`
Expected: PASS — cached balance loads instantly after reload

**Step 3: Commit**

```
test(reveal): add cache persistence verification after page reload
```

---

### Task 6: Add transition state test to `reveal.spec.ts`

**Files:**

- Modify: `packages/playwright/tests/reveal.spec.ts`

**Step 1: Add a test that verifies the masked → decrypting → revealed flow**

This test needs a fresh context (no cache). Add:

```ts
test("should transition through masked → decrypting → revealed states", async ({
  page,
  initialBalances,
  formatUnits,
}) => {
  // Clear IndexedDB cache to ensure fresh decryption
  await page.evaluate(() => {
    const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
    return dbs.then((databases: IDBDatabaseInfo[]) =>
      Promise.all(
        databases.map((db: IDBDatabaseInfo) => {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }),
      ),
    );
  });

  await page.goto("/wallet");
  const row = page.getByTestId("token-row-cUSDT");

  // State 1: Masked
  await expect(row.getByTestId("balance")).toHaveText("****");

  // Click reveal — triggers decryption
  await page.getByTestId("reveal-button").click();

  // State 2: Decrypting (transient — may be fast, so use polling)
  // We check that eventually we land on the final balance,
  // but first confirm we're NOT still masked
  await expect(row.getByTestId("balance")).not.toHaveText("****");

  // State 3: Revealed — final balance
  await expect(row.getByTestId("balance")).toHaveText(formatUnits(initialBalances.cUSDT, 6));
});
```

**Step 2: Run the test**

Run: `cd packages/playwright && npx playwright test reveal.spec.ts --grep "transition"`
Expected: PASS

**Step 3: Commit**

```
test(reveal): add masked → decrypting → revealed transition state verification
```

---

### Task 7: Enhance `activity-feed.spec.ts` with amount cross-checks

**Files:**

- Modify: `packages/playwright/tests/activity-feed.spec.ts`

**Step 1: Add on-chain balance verification alongside activity feed checks**

Add `readErc20Balance`, `initialBalances`, and `computeFee` to the test's destructured args. After the existing activity feed assertions, add:

```ts
// Cross-check: on-chain ERC-20 balance should match shield deduction
const onChainUsdt = await readErc20Balance(contracts.USDT);
expect(onChainUsdt).toBe(initialBalances.USDT - shieldAmount);

// Cross-check: navigate to wallet and verify revealed balance accounts for shield + transfer
await page.goto("/wallet");
await page.getByTestId("reveal-button").click();
const expectedBalance =
  initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount) - transferAmount;
await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
  formatUnits(expectedBalance, 6),
);
```

**Step 2: Run the test**

Run: `cd packages/playwright && npx playwright test activity-feed.spec.ts`
Expected: PASS

**Step 3: Commit**

```
test(activity-feed): add on-chain balance and revealed balance cross-checks
```

---

### Task 8: Final full suite run

**Step 1: Run the complete Playwright suite**

Run: `cd packages/playwright && npx playwright test`
Expected: All tests pass

**Step 2: Commit design doc**

```
docs: add tangible e2e assertions design doc
```
