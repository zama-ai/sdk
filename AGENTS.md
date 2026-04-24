# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, etc.) working in this repository. `CLAUDE.md` is a symlink to this file.

**Project:** `@zama-fhe/sdk` and `@zama-fhe/react-sdk` — TypeScript libraries for building privacy-preserving dApps on EVM-compatible chains powered by the Zama Confidential Blockchain Protocol. The SDK lets developers interact with confidential smart contracts using FHE — encrypt inputs, decrypt outputs, manage access control — without needing to learn cryptography. ERC-7984 confidential tokens are the primary vertical today.

**Design principle: clear-text in, clear-text out.** Callers work with familiar primitives (ERC-20-style for tokens) while the SDK hides the FHE protocol details. When designing or extending APIs, accept plaintext, return plaintext, and push everything FHE-related down into the SDK.

**Package manager:** pnpm 10+ (Node 22+). Install with `pnpm install` — it also auto-initialises git submodules and runs `forge soldeer install` for contracts.

**Agent setup:** run `pnpm setup:claude`. It copies `claude-setup/` → `.claude/` (which is gitignored and unpublished for security, so never commit it) and installs the Zama marketplace plugins and skills. Post-edit hooks then auto-run typecheck, lint, and format after every file change.

## ⚠️ Not `@zama-fhe/relayer-sdk`

`@zama-fhe/sdk` is the **high-level** Zama Protocol SDK. It is **not** the same as `@zama-fhe/relayer-sdk`, which is the **legacy low-level SDK** (wrapped here as a dependency). Most LLM training data predates this repo, so if your prior knowledge of "Zama SDK" centres on `createInstance`, `initSDK`, or direct relayer calls, that's the legacy SDK. Prefer `ZamaSDK`, `Token` / `ReadonlyToken`, and the React hooks.

## Further reading

Load these on demand during planning — they are not preloaded:

- [`docs/agents/vision.md`](docs/agents/vision.md) — fuller product framing (scope, target users, framework-agnostic core, React-first hooks)
- [`docs/agents/architecture.md`](docs/agents/architecture.md) — repo layout, how operations flow through the system (balance, transfer, shield, unshield, routing)
- [`docs/agents/conventions.md`](docs/agents/conventions.md) — shared naming rules and design decisions (contracts-vs-tokens, Solidity-mirror params, pure contract call builders, stage-gate docs language, …)
- [`docs/agents/gotchas.md`](docs/agents/gotchas.md) — shared footguns: address normalization in query keys, PR base branch, shared-branch safety

Some packages add their own AGENTS.md with package-specific rules — they merge with this root file when you're working in that subtree:

- [`packages/react-sdk/AGENTS.md`](packages/react-sdk/AGENTS.md) — hook naming, three-layer architecture, first-decrypt UX, TanStack `useQueries` wrapper rule
