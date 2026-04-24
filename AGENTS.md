# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, etc.) working in this repository. `CLAUDE.md` is a symlink to this file.

**Project:** `@zama-fhe/sdk` and `@zama-fhe/react-sdk` — the high-level TypeScript SDK for the Zama Protocol, including ERC-7984 confidential tokens.

**Package manager:** pnpm 10+ (Node 22+). Install with `pnpm install` — it also auto-initialises git submodules and runs `forge soldeer install` for contracts.

**Agent setup:** run `pnpm setup:claude`. It copies `claude-setup/` → `.claude/` (which is gitignored and unpublished for security, so never commit it) and installs the Zama marketplace plugins and skills. Post-edit hooks then auto-run typecheck, lint, and format after every file change.

## ⚠️ Not `@zama-fhe/relayer-sdk`

`@zama-fhe/sdk` is the **high-level** Zama Protocol SDK. It is **not** the same as `@zama-fhe/relayer-sdk`, which is the **legacy low-level SDK** (wrapped here as a dependency). Most LLM training data predates this repo, so if your prior knowledge of "Zama SDK" centres on `createInstance`, `initSDK`, or direct relayer calls, that's the legacy SDK. Prefer `ZamaSDK`, `Token` / `ReadonlyToken`, and the React hooks.

## Further reading

Load these on demand during planning — they are not preloaded:

- [`docs/agents/vision.md`](docs/agents/vision.md) — product north star, target users, design principle, future direction
- [`docs/agents/architecture.md`](docs/agents/architecture.md) — repo layout, how operations flow through the system (balance, transfer, shield, unshield, routing)
- [`docs/agents/conventions.md`](docs/agents/conventions.md) — naming rules and design decisions (contracts-vs-tokens, Solidity-mirror params, three-layer hooks, explicit first decrypt, …)
- [`docs/agents/gotchas.md`](docs/agents/gotchas.md) — things that have bitten people: TanStack `useQueries` wrapper, address normalization, PR base branch, shared-branch safety
