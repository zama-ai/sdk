# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code Setup

Run `pnpm setup:claude` to install skills, plugins, and post-edit hooks. This copies `claude-setup/` → `.claude/` and installs the Zama marketplace. Post-edit hooks automatically run typecheck, lint, and format after every file change. The `.claude/` directory is gitignored — never commit it.

## Product Vision

The Zama SDK is the high-level TypeScript SDK for the **Zama Protocol**, including ERC-7984 confidential tokens. It publishes `@zama-fhe/sdk` (core) and `@zama-fhe/react-sdk` (React hooks).

**Design principle: clear-text in, clear-text out.** Developers work with familiar primitives (e.g. ERC-20-style `balanceOf`, `transfer` for tokens) while the SDK handles all protocol complexity under the hood — encrypted inputs, EIP-712 signing, Relayer routing, and response format interpretation. The SDK is a credentials + relayer coordination layer that abstracts the protocol so developers never need to understand FHE internals.

**Target users:** wallet developers and dApp developers building on the Zama Protocol who need a high-level integration layer.

**UX goals:** signing prompt minimization (no per-token prompts for balances, single confirmation for transfers), batch balance fetching, decryption caching and staleness management.

**Future direction:** plugin system for additional capabilities beyond tokens — DeFi primitives (swaps, yield), RWA extensions (ERC-3643 + ERC-7984), and domain-specific integrations. The view layer is React-focused today but the architecture accommodates React Native, Vue, and others.

## Repository Structure

**For SDK users:** `packages/sdk/` is the core SDK, `packages/react-sdk/` is the React hooks layer, and `examples/` has working integration examples (react-viem, react-wagmi, react-ethers, node-viem, node-ethers).

**For SDK developers and agents:** `contracts/` has the Solidity smart contracts (Foundry/forge) — ERC-7984 confidential tokens, wrappers, registries, batchers. `test/` has E2E infrastructure (Playwright, Next.js/Vite test apps, shared React test components). `tools/ast-grep/` has custom AST lint rules. `claude-setup/` has Claude Code configuration (copied to `.claude/` by `pnpm setup:claude`). `docs/gitbook/` has user-facing documentation.

## How Operations Flow

The directory structure is shallow, so understanding how data moves through the system requires knowing the layers:

**SDK layers:** `ZamaSDK` orchestrates signer + relayer + storage + credentials, and creates `Token` instances that share credentials. `Token` (write ops) and `ReadonlyToken` (read ops) coordinate between host-chain RPC (for encrypted handles) and the Relayer (for encrypt/decrypt via Web Workers). React hooks follow a three-layer pattern: core action (`packages/sdk/src/query/`) → query options factory → framework hook (`packages/react-sdk/src/`).

**Balance flow (two-phase):** Phase 1 is a cheap RPC poll for the encrypted handle (no signing needed). Phase 2 triggers an expensive relayer decrypt only when the handle changes — this requires EIP-712 credentials (first time needs an explicit user click, then cached). Cache hierarchy: React Query (memory) → IndexedDB balance cache → encrypted credential store → relayer.

**Transfer:** encrypt amount via relayer → single contract call → wait for receipt.

**Shield (public ERC-20 → confidential ERC-7984):** approve underlying ERC-20 → wrap into confidential token.

**Unshield (confidential → public):** two-phase — request (encrypt + contract call) then finalize (after off-chain processing).

**Transparent routing:** the SDK routes between host-chain RPC and Relayer API automatically. Developers never choose which backend to call. The decision is made at initialization: `RelayerWeb` for browser (Web Worker), `RelayerNode` for Node.js (worker_threads).

## Naming Conventions

The SDK is for all Zama Protocol use cases, not just tokens. The code is in transition toward this, so naming discipline matters:

- **SDK-level operations use "contracts":** `contractAddress`, `contractAddresses`, generic ops like allow/revoke/session management, package descriptions, README language. These work with any confidential contract type.
- **Token-specific operations use "tokens":** `Token`/`ReadonlyToken` classes, `shield`, `unshield`, `transfer`, `balanceOf`, ERC-7984/ERC-20 interfaces. These are explicitly about confidential tokens.
- **Generic hooks omit the domain:** `useRevoke` not `useRevokeTokens`, `useAllow` not `useAllowTokens`.
- **Token-specific hooks include the domain:** `useConfidentialBalance`, `useConfidentialTransfer`.
- **User-facing docs:** no Slack links or internal tool references. Linear ticket refs (SDK-42) in code comments and PR titles are fine.

## Design Decisions

- **`create*` factory naming is legacy.** Functions like `createToken`, `createReadonlyToken` imply deploying contracts but actually construct client-side handles to existing on-chain contracts. Don't extend this pattern without considering alternatives like `get*`.
- **First decrypt requires explicit user click.** The first EIP-712 blind sign per session must be triggered by user action (e.g. "Decrypt Balance" button). After that, cached sessions can auto-decrypt on subsequent renders.
- **Three-layer hook architecture.** Core async action → TanStack Query options factory → React hook. The `tanstack-best-practices` skill (installed by `pnpm setup:claude`) documents the full pattern. All new hooks must follow this layering.
- **Contract call builders are pure.** Functions in `packages/sdk/src/contracts/` return `{ address, abi, functionName, args }` config objects. They never execute transactions. Library-specific sub-paths (`/viem`, `/ethers`) compose these.
- **Adapter pattern for framework neutrality.** Core SDK depends only on `GenericSigner` and `GenericStorage` interfaces. New integrations (viem, ethers, wagmi) add an adapter, not a dependency on the core.
- **Credentials scoped to (address, chainId).** Auto-revoked on account or chain switch to prevent cross-wallet leaks.

## Gotchas

- **TanStack `useQueries` wrapper is mandatory** in react-sdk. Never import `useQueries` directly from `@tanstack/react-query` — use the wrapper in `packages/react-sdk/src/utils/query.ts` which injects the custom `queryKeyHashFn`. An ast-grep rule enforces this.
- **Build order matters.** `@zama-fhe/sdk` must build before `@zama-fhe/react-sdk`. `pnpm build` handles this correctly.
- **All react-sdk source files need `"use client"` directive.**
- **Address normalization in query keys.** All addresses in query keys must use `getAddress()` for checksumming. Inconsistent casing causes cache misses.
