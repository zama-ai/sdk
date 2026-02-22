# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Overview

`@zama-fhe/token-react-sdk` — React hooks for Zama confidential ERC-20 tokens (fhEVM). Built on `@tanstack/react-query`, wrapping `@zama-fhe/token-sdk` (workspace dependency). Part of a pnpm monorepo (`@zama-fhe/token-sdk-monorepo`).

## Commands

All commands run from monorepo root (`../../`):

```bash
pnpm build                    # Build token-sdk then token-react-sdk (order matters)
pnpm test                     # Run vitest in watch mode
pnpm test:run                 # Run vitest once
pnpm test:run -- path/to/file # Run a single test file
pnpm lint                     # ESLint
pnpm typecheck                # tsc --noEmit
pnpm format:check             # Prettier check
```

Build this package only: `pnpm --filter @zama-fhe/token-react-sdk build` (runs tsup).

## Architecture

### Four entry points (tsup bundles each separately)

| Entry point           | Import path                        | Purpose                                                           |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `src/index.ts`        | `@zama-fhe/token-react-sdk`        | Provider-based hooks + re-exports from core SDK                   |
| `src/viem/index.ts`   | `@zama-fhe/token-react-sdk/viem`   | Viem-specific hooks + `ViemTokenSDKProvider` + `ViemSigner`       |
| `src/ethers/index.ts` | `@zama-fhe/token-react-sdk/ethers` | Ethers-specific hooks + `EthersTokenSDKProvider` + `EthersSigner` |
| `src/wagmi/index.ts`  | `@zama-fhe/token-react-sdk/wagmi`  | Wagmi-specific hooks + `WagmiTokenSDKProvider` + `WagmiSigner`    |

### Two-layer hook architecture

**Layer 1 — Provider hooks** (`src/token/`, `src/relayer/`): Use `TokenSDKProvider` context. These hooks call `useTokenSDK()` to get the SDK instance, then use `useQuery`/`useMutation` from React Query. They handle cache invalidation automatically (e.g., `useConfidentialTransfer` invalidates balance queries on success).

**Layer 2 — Library-adapter hooks** (`src/viem/`, `src/ethers/`, `src/wagmi/`): Low-level hooks that call contract read/write functions directly through their respective library (viem `PublicClient`/`WalletClient`, ethers `Signer`, wagmi `Config`). These do **not** use the SDK provider context — they're for advanced use when you want fine-grained contract-level control.

### Provider hierarchy

`TokenSDKProvider` (generic, in `src/provider.tsx`) is the base. Library-specific providers (`ViemTokenSDKProvider`, `EthersTokenSDKProvider`, `WagmiTokenSDKProvider`) wrap it by creating a `GenericSigner` adapter from their library's native types.

### Key patterns

- All source files start with `"use client"` directive (also injected by tsup banner for the built output).
- Alias hooks exist: `useShield` → `useWrap`, `useShieldETH` → `useWrapETH`, `useUnshield` → combined unwrap+finalize, `useUnshieldAll` → combined unwrap-all+finalize.
- Balance queries use **two-phase polling**: cheaply poll the encrypted handle (RPC read), only decrypt when the handle changes (expensive relayer roundtrip). See `use-confidential-balance.ts`.
- Query key factories are exported from `confidential-balance-query-keys.ts` and `decryption-cache.ts` for manual cache control.
- Mutation hooks call `context.client.invalidateQueries()` / `resetQueries()` in their `onSuccess` callbacks to keep caches consistent.
- The main `src/index.ts` re-exports nearly everything from `@zama-fhe/token-sdk` (classes, types, ABIs, constants, event decoders, contract call builders) so consumers only need one import source.

### Peer dependencies

React and `@tanstack/react-query` are required. `viem`, `ethers`, and `wagmi` are optional — only needed if you import from their respective sub-paths.
