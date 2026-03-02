# Tangible E2E Test Assertions

## Problem

Current e2e tests verify operations primarily through UI text (success messages, revealed balance text). This leaves gaps:

- No direct on-chain verification — a UI rendering bug could mask a contract failure
- No cache persistence testing — IndexedDB balance cache is untested
- No transition state verification — masked→decrypting→revealed flow is unchecked
- Activity feed verification is minimal (single test, no post-operation cross-checks)

## Design: Fixture-level On-chain Assertions (Approach A)

### 1. On-chain balance assertion helpers in fixtures

Add to `packages/playwright/fixtures/test.ts`:

- `readErc20Balance(token, owner?)` — calls `viemClient.readContract()` with ERC-20 `balanceOf` ABI
- `readConfidentialHandle(token, owner?)` — reads encrypted balance handle from confidential token

Tests assert BOTH UI text AND on-chain state after operations. Example pattern:

```ts
// UI assertion (existing)
await expect(row.getByTestId("balance")).toHaveText(formatUnits(expected, 6));

// On-chain assertion (new)
const onChain = await readErc20Balance(contracts.USDT);
expect(onChain).toBe(initialBalances.USDT - shieldAmount);
```

### 2. Cache persistence verification

New test in `reveal.spec.ts`:

1. Navigate to `/wallet`, reveal balances, wait for decryption
2. Reload the page
3. Navigate to `/wallet`, reveal again
4. Assert balance appears WITHOUT "Decrypting..." intermediate state (cache hit)
5. Verify cached value matches expected amount

### 3. Transition state verification

New test in `reveal.spec.ts`:

1. Navigate to `/wallet`
2. Assert `"****"` (masked state)
3. Click reveal
4. Assert `"Decrypting..."` appears (transient state)
5. Assert final balance resolves to expected number

### 4. Enhanced operation tests with on-chain cross-checks

Enhance existing spec files:

- `shield.spec.ts` — add ERC-20 balance decrease assertion via readContract
- `unshield.spec.ts` — add ERC-20 balance increase assertion via readContract
- `transfer.spec.ts` — add sender balance decrease on-chain check
- `activity-feed.spec.ts` — verify decrypted amounts after shield+transfer

### Files modified

- `packages/playwright/fixtures/test.ts` — add readErc20Balance helper + export
- `packages/playwright/tests/shield.spec.ts` — add on-chain assertions
- `packages/playwright/tests/unshield.spec.ts` — add on-chain assertions
- `packages/playwright/tests/transfer.spec.ts` — add on-chain assertions
- `packages/playwright/tests/reveal.spec.ts` — add cache persistence + transition state tests
