# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zama SDK is a TypeScript monorepo for building privacy-preserving dApps on EVM blockchains using Fully Homomorphic Encryption (FHE). It publishes two npm packages: `@zama-fhe/sdk` (core) and `@zama-fhe/react-sdk` (React hooks).

## Commands

```bash
pnpm install                # Install deps (auto-inits git submodules + forge soldeer)
pnpm build                  # Build sdk then react-sdk (order matters)
pnpm build:sdk              # Build only @zama-fhe/sdk
pnpm build:react-sdk        # Build only @zama-fhe/react-sdk

pnpm test                   # Vitest watch mode
pnpm test:run               # Single run, all unit tests
pnpm test:run -- packages/sdk/src/token/__tests__/token.test.ts  # Single file
pnpm test:coverage          # Coverage report (thresholds: 80% lines/branches/functions)
pnpm test:integration       # Integration tests (30s timeout)

pnpm typecheck              # TypeScript checking across all packages
pnpm lint                   # oxlint + ast-grep rules
pnpm lint:fix               # Auto-fix lint issues
pnpm format                 # Format with oxfmt
pnpm format:check           # Check formatting

pnpm e2e:test               # Playwright E2E tests (all targets)
pnpm e2e:test:nextjs        # E2E: Next.js app only
pnpm e2e:test:vite          # E2E: Vite app only
pnpm e2e:test:node          # E2E: Node.js (builds sdk first)

pnpm contracts:build        # Build Solidity contracts (forge)
pnpm api-report             # Generate API surface reports (api-extractor)
pnpm size                   # Bundle size check (sdk ESM: 48KB, CJS: 40KB, react-sdk: 15KB)
```

## Architecture

### Monorepo Layout

- **`packages/sdk/`** — Core SDK (`@zama-fhe/sdk`). Multiple entry points via sub-path exports:
  - `.` — Core: ZamaSDK, Token, CredentialsManager, RelayerWeb
  - `./viem` — Viem adapter (ViemSigner, contract call builders)
  - `./ethers` — Ethers adapter (EthersSigner, contract call builders)
  - `./node` — Node.js backend (ESM-only, uses worker_threads)
  - `./query` — TanStack Query integration with cache invalidation
  - `./cleartext` — Testing adapter (unencrypted FHE operations)
- **`packages/react-sdk/`** — React hooks (`@zama-fhe/react-sdk`). Entry points:
  - `.` — React hooks and ZamaSDKProvider
  - `./wagmi` — Wagmi adapter (WagmiSigner)
- **`contracts/`** — Solidity smart contracts (Foundry/forge). ERC7984 confidential tokens, wrappers, registries, batchers.
- **`test/`** — E2E infrastructure (Playwright, Next.js/Vite test apps, shared React test components)
- **`tools/ast-grep/`** — Custom AST lint rules
- **`docs/gitbook/`** — Documentation (mdbook)

### Key Design Patterns

**Adapter pattern:** Generic interfaces (`GenericSigner`, `GenericStorage`) with library-specific implementations. The SDK core is framework-agnostic; viem/ethers/wagmi adapters implement `GenericSigner`.

**Contract call builders:** Pure functions returning `ContractCallConfig` objects. Library-specific sub-paths compose these for viem or ethers.

**Worker strategy:** Browser uses WebWorkers for WASM-based FHE; Node.js uses `worker_threads` pools. Both avoid blocking the main thread.

**Storage abstraction:** `IndexedDBStorage` (browser), `MemoryStorage` (tests), `ChromeSessionStorage` (extensions), `AsyncLocalStorage` (Node.js).

**TanStack Query wrapper:** The react-sdk wraps `useQueries` in `packages/react-sdk/src/utils/query.ts` to inject a custom `queryKeyHashFn`. Direct imports of `useQueries` from `@tanstack/react-query` are banned by ast-grep rule — always use the wrapper.

### Build System

- **Rolldown** with DTS plugin for both packages
- SDK outputs ESM (`dist/esm/`) + CJS (`dist/cjs/`), react-sdk outputs ESM only
- API surface tracked by `@microsoft/api-extractor` — run `pnpm api-report` to regenerate `.api.md` files

### Test Configuration

Vitest runs three projects defined in `vitest.config.ts`:
- **`sdk`** — Node environment, `vmForks` pool
- **`typecheck`** — Type-level tests (`*.test-d.ts`)
- **`react-sdk`** — happy-dom environment, includes worker tests

Path aliases in vitest.config.ts resolve `@zama-fhe/sdk` and `@zama-fhe/react-sdk` to source directories (not dist), enabling tests without a build step.

## Code Style

- **ESM-only** — all packages use `"type": "module"`
- **Linter:** oxlint (not eslint) with type-aware rules. Key rules: `no-explicit-any`, `consistent-type-imports`, `no-floating-promises`, `no-console` (except in allowed files), `eqeqeq`, `curly`
- **Formatter:** oxfmt (not prettier)
- **Unused variables:** prefix with `_`
- **Tests:** Colocated in `__tests__/` directories, use vitest globals (`describe`, `it`, `expect`, `vi`)
- **React SDK:** All source files use `"use client"` directive
- **TypeScript:** `verbatimModuleSyntax` enabled — use `import type` for type-only imports
- **Commit messages:** Conventional Commits format — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, with optional scope like `feat(react-sdk):`
- **Pre-commit hooks:** Husky + lint-staged runs oxlint, ast-grep, and oxfmt on staged files

## Release

Semantic-release automates versioning. Both packages are versioned in lockstep. `main` publishes to npm `latest`; `prerelease` branch publishes to npm `alpha`. CI gates: Vitest + Playwright must pass before publish.
