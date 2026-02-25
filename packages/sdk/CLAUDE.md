# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@zama-fhe/sdk` — TypeScript SDK for privacy-preserving ERC-20 token operations using Fully Homomorphic Encryption (fhEVM). Part of a pnpm monorepo at `packages/sdk`.

## Commands

All commands run from the **monorepo root** (`../../`):

```bash
pnpm test              # Run all tests (vitest, watch mode)
pnpm test:run          # Run all tests once
pnpm test:run -- --reporter=verbose src/token/__tests__/token.test.ts  # Single test file
pnpm test:coverage     # Coverage report
pnpm build             # Build all packages (tsup)
pnpm typecheck         # Type check (tsc --noEmit)
pnpm lint              # ESLint
pnpm format:check      # Prettier check
pnpm format            # Prettier fix
```

Build this package only: `pnpm --filter @zama-fhe/sdk build`

## Architecture

### Four Export Paths

The package exposes four entry points via `package.json` exports:

- **`@zama-fhe/sdk`** — Core SDK: `ZamaSDK`, `Token`, `ReadonlyToken`, relayer web backend (`RelayerWeb`), event decoders, activity feed helpers, contract call builders, ABIs, storage adapters, error types
- **`@zama-fhe/sdk/viem`** — `ViemSigner` adapter + viem-native read/write contract helpers
- **`@zama-fhe/sdk/ethers`** — `EthersSigner` adapter + ethers-native read/write contract helpers
- **`@zama-fhe/sdk/node`** — `RelayerNode`, `NodeWorkerClient`, `NodeWorkerPool`, network preset configs

### Layered Design

```
ZamaSDK (factory)
  ├── Token (extends ReadonlyToken)
  │     ├── Contract call builders (src/contracts/) — pure functions returning ContractCallConfig
  │     ├── CredentialsManager — AES-GCM encrypted FHE credential storage
  │     └── RelayerSDK interface — FHE encrypt/decrypt operations
  └── ReadonlyToken
        ├── Balance queries, batch operations, ERC-165 checks
        └── Static methods: authorizeAll, batchDecryptBalances
```

**Key abstractions:**

- **`GenericSigner`** (`src/token/token.types.ts`) — Framework-agnostic wallet interface (5 methods). Implemented by `ViemSigner`, `EthersSigner`, and `WagmiSigner` (in `react-sdk`).
- **`RelayerSDK`** (`src/relayer/relayer-sdk.ts`) — FHE operations interface. `RelayerWeb` uses a Web Worker + WASM CDN bundle. `RelayerNode` calls `@zama-fhe/relayer-sdk/node` directly.
- **`GenericStringStorage`** — Pluggable key-value store for persisted FHE credentials. All methods (`getItem`, `setItem`, `removeItem`) return `Promise` — implementations must be async. `MemoryStorage` for tests, `IndexedDBStorage` for browser.
- **Contract call builders** (`src/contracts/`) — Pure functions returning `ContractCallConfig` objects. All builders validate address arguments at runtime via `assertAddress()` (`0x` + 40 hex chars); FHE data params (handles, proofs, interface IDs) are not validated. The viem/ethers sub-paths wrap these with library-specific execution.

### Worker Architecture

Browser FHE runs in a Web Worker (`src/worker/`):

- `RelayerWorkerClient` sends typed requests to the worker, tracks pending promises with timeouts
- `relayer-sdk.worker.ts` — Web Worker entry that loads WASM from CDN
- Node.js has `NodeWorkerClient` (single worker thread) and `NodeWorkerPool` (least-connections scheduling)

### Error Handling

All SDK errors extend `ZamaError` (base class in `src/token/errors.ts`). Each error code has a dedicated subclass (e.g. `EncryptionFailedError`, `SigningRejectedError`). Methods catch non-SDK errors and re-wrap them with the appropriate subclass. Use `instanceof` to match specific errors.

## Code Conventions

- ESM-only (`"type": "module"`), built with tsup
- Tests use vitest with `vi.fn()` mocks for `RelayerSDK` and `GenericSigner`
- Test files live in `__tests__/` directories adjacent to source
- Peer dependencies (viem, ethers, `@zama-fhe/relayer-sdk`) are all optional — the SDK works with any combination
- `Address` type (`` `0x${string}` ``) for contract/wallet addresses; `Hex` type (same shape) for signatures, tx hashes, and proofs. Contract call builders enforce valid addresses at runtime (`assertAddress` in `src/utils.ts`)
- Tests must use full 42-character addresses (e.g. `"0x1111111111111111111111111111111111111111"`) — short placeholders like `"0xtoken"` will fail `assertAddress` validation
- Unused vars prefixed with `_` (ESLint configured)
- Husky + lint-staged run ESLint and Prettier on pre-commit
