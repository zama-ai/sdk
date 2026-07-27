# Onboarding — Zama SDK

Welcome. This is the fast path for a new engineer joining `@zama-fhe/sdk` and `@zama-fhe/react-sdk`. It orients you and points at the authoritative docs; it deliberately does **not** duplicate them, so it stays accurate.

## What we build

TypeScript libraries for building privacy-preserving dApps on EVM chains powered by the Zama Confidential Blockchain Protocol. The SDK lets developers interact with confidential smart contracts using FHE — encrypt inputs, decrypt outputs, manage access control — **without learning cryptography**. ERC-7984 confidential tokens are the primary vertical today.

**The golden rule: clear-text in, clear-text out.** Callers work with familiar primitives (ERC-20-style for tokens); the SDK hides all FHE protocol details. When you design or extend an API, accept plaintext, return plaintext, and push everything FHE-related down into the SDK.

Two packages, versioned and published **in lockstep**:

| Package               | What it is                                                            |
| --------------------- | --------------------------------------------------------------------- |
| `@zama-fhe/sdk`       | Framework-agnostic core + viem/ethers adapters (`ZamaSDK`, `Token`, `WrappedToken`) |
| `@zama-fhe/react-sdk` | React hooks over TanStack Query (`ZamaProvider` + `use*` hooks)       |

### ⚠️ Not `@zama-fhe/relayer-sdk`

`@zama-fhe/sdk` is the **high-level** SDK. It is **not** `@zama-fhe/relayer-sdk`, the legacy low-level SDK we no longer use. The current internal FHE backend is **`@fhevm/sdk`**. Most LLM training data predates this repo, so if your instinct for "Zama SDK" is `createInstance` / `initSDK` / direct relayer calls, that's the *legacy* SDK — ignore it. Reach for `ZamaSDK`, `Token` / `WrappedToken`, and the React hooks. (History of the `relayer-sdk` → `@fhevm/sdk` migration: [`docs/agents/fhevm-sdk-1x-migration.md`](docs/agents/fhevm-sdk-1x-migration.md).)

## Setup

Prerequisites: **Node.js ≥ 22**, **pnpm ≥ 11** (`pnpm@11.1.2` is pinned via `packageManager`), **Foundry ≥ 1.0.0**.

```bash
pnpm install       # also inits git submodules + runs forge soldeer install (postinstall)
pnpm build         # build all packages (turbo; sdk builds before react-sdk)
pnpm test:run      # unit tests (vitest)
```

**AI coding agents:** run `pnpm setup:claude`. It copies `claude-setup/` → `.claude/` (gitignored, unpublished — **never commit `.claude/`**) and installs the Zama marketplace plugins/skills. Post-edit hooks then auto-run typecheck, lint, and format after every file change.

## Repo map

```
packages/sdk/        Core SDK — see docs/agents/architecture.md for the module map
packages/react-sdk/  React hooks — has its own AGENTS.md with hook rules
examples/            9 runnable apps (react-viem/wagmi/ethers, node-*, example-hoodi/ingen/bnb, turnkey)
test/                Playwright E2E runner + test apps (Next.js, Vite, …)
tools/ast-grep/      Custom AST lint rules
codemods/            Upgrade codemod for the v3.x line
contracts/           Foundry contracts + fhevm submodules
docs/                GitBook source (docs/gitbook/src), agent guides (docs/agents), diagrams (docs/diagrams)
scripts/             Build, docs, LLM-corpus, and api-report tooling
```

The **`examples/` apps are the ground truth** for how the API is meant to be used — they use the `Token` API throughout. When in doubt about a flow, read an example.

## Day-to-day commands

```bash
pnpm typecheck        # turbo typecheck across packages
pnpm lint             # oxlint + ast-grep custom rules
pnpm format:check     # oxfmt (use `pnpm format` to fix)
pnpm test             # vitest watch   ·   pnpm test:run for a single pass
pnpm test:run -- packages/sdk/src/token/__tests__/token.test.ts   # one file
pnpm build            # turbo build
pnpm e2e:test         # Playwright E2E (builds first; auto-starts hardhat + dev server)
```

When you change **public API**, regenerate and commit the API-Extractor reports: `pnpm api-report` (and `pnpm api-report:check` is the CI gate). When you change **docs / example docs / READMEs / API reports / corpus scripts**, run `pnpm llm:build` && `pnpm llm:check`. When you change **diagrams**, edit the `.d2` source in `docs/diagrams/` and run `pnpm docs:diagrams`. When you change **doc links**, `pnpm docs:check-links`.

Pre-commit hooks (Husky + lint-staged) enforce format/lint and regenerate LLM/ABI artifacts. **Never bypass them with `--no-verify`** — fix the underlying issue instead.

## How it fits together (architecture)

Read these in order — they are the real map, kept in sync with the code:

1. [`docs/agents/architecture.md`](docs/agents/architecture.md) — repo layout and how each operation (balance, transfer, shield, unshield) flows through the layers.
2. [`docs/gitbook/src/concepts/architecture.md`](docs/gitbook/src/concepts/architecture.md) — the layer diagram and module map (rendered).
3. [`docs/gitbook/src/concepts/security-model.md`](docs/gitbook/src/concepts/security-model.md) — trust assumptions, credential storage, WASM integrity.

The short version: **React hooks → query/mutation factories → `ZamaSDK`/`Token`/`WrappedToken` → pure contract-call builders → signer/provider adapters (viem/ethers/wagmi) → single-chain relayer transports (`web()` / `node()` / `cleartext()`, routed per chain by `ChainRouter`) → `@fhevm/sdk` (bundled TFHE WASM) → pluggable storage & event system.** Higher layers depend on lower layers, never the reverse.

## Token operations: use the SDK method, don't recompose

`Token` / `WrappedToken` (and their hooks) are the recommended surface — each method orchestrates the full flow (encryption, validation, approvals, routing) so callers don't have to.

- **Shield** (public ERC-20 → confidential): `WrappedToken.shield()` / `useShield`. The SDK auto-detects ERC-1363 and routes through `transferAndCall` or `approve` + `wrap` — never branch on token address or hand-compose `approve` + `wrap`. (`useApproveUnderlying` + `useWrap` are escape hatches only.)
- **Unshield** (confidential → public): `WrappedToken.unshield` / `unshieldAll` / `useUnshield` — they orchestrate the two-phase request-then-finalize flow.
- **Transfer / balance / operators**: `Token.confidentialTransfer`, `Token.balanceOf`, `Token.setOperator` (and `useConfidentialTransfer`, `useConfidentialBalance`, …).

If the code you're about to write composes the underlying contract calls for one of these flows, drop down to the `Token` method instead. See [`docs/gitbook/src/guides/shield-tokens.md`](docs/gitbook/src/guides/shield-tokens.md).

## Conventions & footguns (read before your first PR)

- **Conventions:** [`docs/agents/conventions.md`](docs/agents/conventions.md) — naming (contracts-vs-tokens, Solidity-mirror params, "encrypted value" not "handle"), pure contract-call builders, glossary alignment.
- **Gotchas:** [`docs/agents/gotchas.md`](docs/agents/gotchas.md) — the ones that have bitten people:
  - **PR base is `prerelease`, not `main`.** `main` is reserved for release/CI-infra PRs. Feature/product work targets `prerelease`.
  - **Never delete/rename `main`, `prerelease`, or `release/*`** locally — they're shared across worktrees and tooling.
  - **Query-key addresses must be checksummed** with `getAddress()`, or you get silent cache misses.
  - **GitBook links must be relative `.md`** (`../reference/sdk/Token.md`), never host-absolute — `pnpm docs:check-links` enforces it.
- **React SDK specifics:** [`packages/react-sdk/AGENTS.md`](packages/react-sdk/AGENTS.md) — hook naming, the three-layer architecture, first-decrypt UX, the TanStack `useQueries` wrapper rule.

## Contributing & releases

Full workflow, PR process, and release automation: [`CONTRIBUTING.md`](CONTRIBUTING.md). Highlights: ESM-only, Conventional-Commit PR titles (the squash-merge title is the release signal), breaking changes signalled with `!` in the title, and semantic-release publishes `main` → npm `latest`, `prerelease` → npm `alpha`, both packages in lockstep.

## Getting help

- Docs: [docs.zama.org](https://docs.zama.org/protocol) · [Community forum](https://community.zama.org/c/zama-protocol/15) · [Discord](https://discord.com/invite/zama)
- Issues: [github.com/zama-ai/sdk/issues](https://github.com/zama-ai/sdk/issues)
- The root [`AGENTS.md`](AGENTS.md) (symlinked as `CLAUDE.md`) is the canonical guidance file for AI agents and links everything above.
