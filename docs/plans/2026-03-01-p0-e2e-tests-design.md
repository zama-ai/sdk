# P0 E2E Test Coverage Design

## Goal

Add e2e tests for three high-risk, user-facing React SDK features that currently have zero coverage:

- **Resume Unshield** — recovery path for interrupted 2-step unshields
- **Batch Transfer** — multi-recipient confidential transfers
- **Activity Feed** — full two-phase flow: parse logs, extract handles, decrypt, render

ShieldETH is deferred (no WETH wrapper deployed in hardhat).

## Architecture

Follow existing patterns exactly:

- Same Playwright fixtures (snapshot/revert, wallet injection, FHE mocking)
- Same test-component structure (form with testids, success/error display)
- Same URL query param pattern for token/address selection
- Same balance verification with `computeFee`

### New Test Components (packages/test-components/src/)

#### 1. ResumeUnshieldForm

**Props:** `tokenAddress`, `wrapperAddress` (from query params)

**Flow:**

1. Display current confidential balance
2. Amount input + "Unwrap" button → calls `useUnwrap` (phase 1 only)
3. On success, display unwrap tx hash in a `data-testid="unwrap-tx-hash"` element
4. "Resume Unshield" button → calls `useResumeUnshield` with the captured tx hash
5. On finalize success, display finalize tx hash in `data-testid="resume-success"`

**Hooks used:** `useUnwrap`, `useFinalizeUnwrap` (via `useResumeUnshield`), `useConfidentialBalance`, `useTokenMetadata`

#### 2. BatchTransferForm

**Props:** `tokenAddress`, `batcherAddress` (from query params)

**Flow:**

1. Display current confidential balance
2. Two recipient/amount input pairs (hardcoded to 2 recipients)
3. "Batch Transfer" button → encrypts amounts, builds `BatchTransferData[]`, calls `useConfidentialBatchTransfer`
4. On success, display tx hash in `data-testid="batch-transfer-success"`

**Hooks used:** `useConfidentialBatchTransfer`, `useEncrypt`, `useConfidentialBalance`, `useTokenMetadata`, `useBatchTransferFee`

#### 3. ActivityFeedPanel

**Props:** `tokenAddress` (from query params)

**Flow:**

1. Fetch all token logs for current user via viem `getLogs` (all event topics)
2. Pass logs to `useActivityFeed` with `decrypt: true`
3. Render each `ActivityItem` as a row:
   - `data-testid="activity-item-{index}"` — the row
   - `data-testid="activity-type-{index}"` — event type (shield/transfer/etc)
   - `data-testid="activity-direction-{index}"` — direction (incoming/outgoing/self)
   - `data-testid="activity-amount-{index}"` — decrypted amount or clear amount
4. Display total count in `data-testid="activity-count"`

**Hooks used:** `useActivityFeed`, `useTokenMetadata`

### New Pages (packages/test-vite/src/pages/)

- `/resume-unshield?token=0x...&wrapper=0x...` → `ResumeUnshieldForm`
- `/batch-transfer?token=0x...&batcher=0x...` → `BatchTransferForm`
- `/activity-feed?token=0x...` → `ActivityFeedPanel`

### New Test Specs (packages/playwright/tests/)

#### resume-unshield.spec.ts

1. Shield 100 USDT
2. Call unwrap (phase 1) — capture unwrap tx hash displayed in UI
3. Click "Resume" to finalize from that tx hash
4. Verify: finalize tx hash displayed, confidential balance decreased

#### batch-transfer.spec.ts

1. Shield 500 USDT
2. Enter 2 recipients (Account#1 twice) with 50 each
3. Click "Batch Transfer"
4. Verify: tx hash displayed, sender confidential balance decreased by ~100 + fees

#### activity-feed.spec.ts

1. Shield 200 USDT (generates Wrapped event with clear amount)
2. Transfer 50 cUSDT to Account#1 (generates ConfidentialTransfer event)
3. Navigate to activity feed page
4. Verify: 2+ entries visible, shield entry shows "shield" type with correct amount, transfer entry shows "transfer" type with decrypted outgoing amount

## Contract Requirements

- **TransferBatcher:** Already deployed in hardhat. Need to find/confirm its deployed address in the fixture setup.
- **WETH wrapper:** Not needed (ShieldETH deferred).

## Test Data

- Same accounts: Hardhat #0 (sender), #1 (recipient)
- Same tokens: USDT/cUSDT, USDC/cUSDC
- Fee calculation: `(amount * 100 + 9999) / 10000` (1% ceiling)
