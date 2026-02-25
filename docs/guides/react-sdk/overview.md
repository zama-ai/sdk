# React SDK Overview

React hooks for confidential token operations, built on [React Query](https://tanstack.com/query). Provides declarative, cache-aware hooks for balances, confidential transfers, shielding, unshielding, and decryption — so you never deal with raw FHE operations in your components.

## Installation

```bash
pnpm add @zama-fhe/react-sdk @tanstack/react-query
```

`@zama-fhe/sdk` is included as a direct dependency — no need to install it separately.

### Peer dependencies

| Package                 | Version | Required?                                     |
| ----------------------- | ------- | --------------------------------------------- |
| `react`                 | >= 18   | Yes                                           |
| `@tanstack/react-query` | >= 5    | Yes                                           |
| `viem`                  | >= 2    | Optional — for `/viem` and `/wagmi` sub-paths |
| `ethers`                | >= 6    | Optional — for `/ethers` sub-path             |
| `wagmi`                 | >= 2    | Optional — for `/wagmi` sub-path              |

## Entry Points

| Import Path                  | Contents                                            |
| ---------------------------- | --------------------------------------------------- |
| `@zama-fhe/react-sdk`        | Provider-based hooks + all re-exports from core SDK |
| `@zama-fhe/react-sdk/viem`   | Viem-specific hooks + `ViemSigner`                  |
| `@zama-fhe/react-sdk/ethers` | Ethers-specific hooks + `EthersSigner`              |
| `@zama-fhe/react-sdk/wagmi`  | Wagmi-specific hooks + `WagmiSigner`                |

## Architecture

### Two-Layer Hook Design

**Layer 1 -- Provider hooks** (main import): Use `ZamaProvider` context. Handle FHE encryption, cache invalidation, and error wrapping automatically.

**Layer 2 -- Library-adapter hooks** (`/viem`, `/ethers`, `/wagmi`): Low-level hooks that call contracts directly through their respective library. Do not use the SDK provider context. For advanced use when you need fine-grained contract-level control.

### Key Patterns

- All source files use `"use client"` directive (required for Next.js and other SSR frameworks).
- Balance queries use **two-phase polling**: cheaply poll the encrypted handle via RPC, only decrypt when the handle changes.
- Mutation hooks automatically invalidate relevant caches on success.
- Query key factories are exported for manual cache control.
- The main entry re-exports nearly everything from `@zama-fhe/sdk`, so consumers only need one import source.

## Re-exports from Core SDK

All public exports from `@zama-fhe/sdk` are re-exported from the main entry point. You never need to import from the core package directly when using the React SDK. This includes classes, types, ABIs, constants, event decoders, contract call builders, and error types.

## Next Steps

- [Provider Setup](provider-setup.md) -- configuring `ZamaProvider`
- [Hooks Guide](hooks.md) -- core hooks reference
- [Hook Disambiguation](hook-disambiguation.md) -- which hook to use when
- [Library Adapters](library-adapters.md) -- viem/ethers/wagmi sub-path hooks
- [API Reference](../../api/react-sdk/src/README.md) -- full generated API docs
