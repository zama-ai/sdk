# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

E2E test application for `@zama-fhe/token-sdk` and `@zama-fhe/token-react-sdk`. It's a Next.js app (v16, App Router) that exercises confidential token operations (shield, transfer, unshield) against a local Hardhat node with FHE mock contracts. Part of the `@zama-fhe/sdk-monorepo` pnpm workspace.

## Commands

All commands run from this directory (`packages/test-app`):

```bash
# Dev server (standard)
pnpm dev

# Dev server for E2E (uses hardhat network + burner connector)
pnpm dev:e2e

# Run E2E tests (starts hardhat node + dev server automatically)
pnpm e2e:test

# Run E2E tests with Playwright UI
pnpm e2e:test:ui

# Run a single test file
npx playwright test playwright/tests/shield.spec.ts

# Run a single test by name
npx playwright test -g "should shield USDT"
```

From monorepo root:

```bash
pnpm build          # Build token-sdk then token-react-sdk (required before test-app works)
pnpm lint           # ESLint across monorepo
pnpm e2e:test       # Run test-app E2E tests
pnpm hardhat:node   # Start hardhat node standalone
```

## Architecture

### Provider Stack (`src/providers.tsx`)

Wraps the app in: `QueryClientProvider` > `WagmiProvider` > `TokenSDKProvider`. Creates a `WagmiSigner` and `RelayerWeb` with lazy chain ID resolution. When `NEXT_PUBLIC_NETWORK=hardhat`, uses a custom burner wallet connector instead of injected wallets.

### Burner Connector (`src/burner-connector.ts`)

Custom wagmi connector for E2E testing. Reads private key from `localStorage("burnerWallet.pk")` — tests inject this via `page.addInitScript`. Handles `eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v4`, and chain switching.

### E2E Test Fixtures (`playwright/fixtures/`)

- **`test.ts`**: Extends Playwright's `base.test` with fixtures: `privateKey`, `account`, `viemClient`, `contracts`. The `page` fixture snapshots Hardhat state before each test and reverts after, ensuring test isolation.
- **`fhevm.ts`**: Intercepts relayer SDK HTTP routes (`/generateKeypair`, `/createEIP712`, `/encrypt`, `/userDecrypt`, `/publicDecrypt`) using Playwright route mocking + `@fhevm/mock-utils`. Uses a mutex (`decryptLock`) to serialize decrypt calls — concurrent calls interfere with Hardhat's mock coprocessor. Also intercepts the CDN SDK script request and serves a local mock (`relayer-sdk.js`).

### Contract Addresses

Hardcoded in `playwright/fixtures/test.ts` — these match the Hardhat deployment in the `hardhat` submodule at repo root. If contracts are redeployed, these addresses must be updated.

### Pages / Components

Each route (`/shield`, `/transfer`, `/unshield`, `/wallet`) maps to `src/app/<route>/page.tsx` with a corresponding form component in `src/components/`. Components use `data-testid` attributes for Playwright selectors.

## Key Patterns

- Tests run serially (`workers: 1`, `fullyParallel: false`) because the Hardhat mock coprocessor can't handle concurrent decrypt operations.
- Playwright auto-starts both the Hardhat node (port 8545) and the Next.js dev server (port 3100) via `webServer` config. In non-CI, it reuses existing servers.
- The SDK packages (`token-sdk`, `token-react-sdk`) must be built before the test-app can run — they're workspace dependencies.
- `next.config.ts` sets `ignoreBuildErrors: true` for TypeScript because cross-package viem version mismatches are benign at runtime.
