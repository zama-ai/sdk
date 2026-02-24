# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`@zama-fhe/token-sdk-monorepo` — TypeScript SDKs for privacy-preserving ERC-20 token operations using Fully Homomorphic Encryption (Zama fhEVM). Three packages in a pnpm workspace:

- **`packages/sdk`** (`@zama-fhe/sdk`) — Core SDK: confidential token operations, FHE relayer integration, contract call builders, viem/ethers adapters, Node.js worker pool
- **`packages/token-react-sdk`** (`@zama-fhe/token-react-sdk`) — React hooks wrapping the core SDK via `@tanstack/react-query`, with viem/ethers/wagmi sub-paths
- **`packages/test-app`** (`@zama-fhe/test-app`) — Next.js E2E test app using Playwright against a local Hardhat node with FHE mock contracts

## Commands

```bash
# Install
pnpm install

# Build (order matters: token-sdk first, then token-react-sdk)
pnpm build

# Unit tests (vitest, jsdom environment)
pnpm test              # Watch mode
pnpm test:run          # Single run
pnpm test:run -- --reporter=verbose packages/sdk/src/token/__tests__/token.test.ts  # Single file

# Type checking & linting
pnpm typecheck         # tsc --noEmit
pnpm lint              # ESLint
pnpm format:check      # Prettier check
pnpm format            # Prettier fix

# E2E tests (requires build first; auto-starts hardhat + next dev server)
pnpm e2e:test          # Playwright headless
pnpm e2e:test:ui       # Playwright UI mode

# Hardhat (submodule at repo root)
pnpm submodule:init    # Initialize hardhat submodule
pnpm hardhat:install   # Install hardhat deps
pnpm hardhat:node      # Start local hardhat node
```

Build a single package: `pnpm --filter @zama-fhe/sdk build` or `pnpm --filter @zama-fhe/token-react-sdk build`

## Architecture

### Monorepo Structure

The workspace uses pnpm with `packages/*`. Vitest is configured at the root with aliases resolving `@zama-fhe/sdk` and `@zama-fhe/token-react-sdk` to their source directories (not built output), so tests run against source without building first.

The `hardhat` directory is a git submodule containing FHE-enabled smart contracts used for E2E testing. It runs independently with npm (not pnpm).

### Package Dependency Chain

```
test-app → token-react-sdk → token-sdk → @zama-fhe/relayer-sdk (external)
```

Each SDK package has multiple entry points (main, `/viem`, `/ethers`, `/node` or `/wagmi`) built as separate bundles by tsup. See per-package `CLAUDE.md` files for detailed architecture.

### Key Design Patterns

- **Framework-agnostic core**: `token-sdk` defines a `GenericSigner` interface (with `getChainId`, `getAddress`, `signTypedData`, `writeContract`, `readContract`, `waitForTransactionReceipt`); viem/ethers/wagmi adapters implement it. React hooks in `token-react-sdk` follow the same split.
- **Lazy chain ID resolution**: `RelayerWeb` and `RelayerNode` accept a `getChainId` function. The worker/pool is re-initialized automatically when the chain changes.
- **Single provider**: React apps use `TokenSDKProvider` directly with an explicitly constructed signer adapter. No library-specific provider wrappers.
- **Contract call builders**: Pure functions in `token-sdk/src/contracts/` return `ContractCallConfig` objects. All builders validate address arguments at runtime via `assertAddress()` (must be `0x` + 40 hex chars). Library-specific sub-paths wrap these with execution logic.
- **FHE via Web Workers**: Browser FHE operations run in a Web Worker loading WASM from CDN (`RelayerWeb`). Node.js uses `NodeWorkerClient`/`NodeWorkerPool` with worker threads.
- **Two-phase balance polling** (React SDK): Poll encrypted handle cheaply via RPC, only decrypt when handle changes.

## Code Conventions

- ESM-only (`"type": "module"` in both SDK packages), built with tsup
- Unused vars prefixed with `_` (ESLint rule: `argsIgnorePattern: "^_"`)
- React SDK files use `"use client"` directive (also injected via tsup banner)
- Tests live in `__tests__/` directories adjacent to source, using vitest with `vi.fn()` mocks
- Husky + lint-staged run ESLint and Prettier on pre-commit
- Changesets for versioning (`pnpm changeset`)
