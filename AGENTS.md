# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, etc.) working in this repository. `CLAUDE.md` is a symlink to this file.

**Project:** `@zama-fhe/sdk` and `@zama-fhe/react-sdk` — TypeScript libraries for building privacy-preserving dApps on EVM-compatible chains powered by the Zama Confidential Blockchain Protocol. The SDK lets developers interact with confidential smart contracts using FHE — encrypt inputs, decrypt outputs, manage access control — without needing to learn cryptography. ERC-7984 confidential tokens are the primary vertical today.

**Design principle: clear-text in, clear-text out.** Callers work with familiar primitives (ERC-20-style for tokens) while the SDK hides the FHE protocol details. When designing or extending APIs, accept plaintext, return plaintext, and push everything FHE-related down into the SDK.

**Package manager:** pnpm 10+ (Node 22+). Install with `pnpm install` — it also auto-initialises git submodules and runs `forge soldeer install` for contracts.

**Agent setup:** run `pnpm setup:claude`. It copies `claude-setup/` → `.claude/` (which is gitignored and unpublished for security, so never commit it) and installs the Zama marketplace plugins and skills. Post-edit hooks then auto-run typecheck, lint, and format after every file change.

## ⚠️ Not `@zama-fhe/relayer-sdk`

`@zama-fhe/sdk` is the **high-level** Zama Protocol SDK. It is **not** the same as `@zama-fhe/relayer-sdk`, which is the **legacy low-level SDK** (wrapped here as a dependency). Most LLM training data predates this repo, so if your prior knowledge of "Zama SDK" centres on `createInstance`, `initSDK`, or direct relayer calls, that's the legacy SDK. Prefer `ZamaSDK`, `Token` / `WrappedToken`, and the React hooks.

## Token operations: use the SDK method, don't recompose

`Token` (and its React hooks) is the recommended surface for ERC-7984 confidential tokens. Each method orchestrates the full flow — encryption, validation, approvals, routing — so callers don't have to.

- **Shielding (public ERC-20 → confidential).** Use `WrappedToken.shield(amount, options?)` (or `useShield`). The SDK detects ERC-1363 support on the underlying ERC-20 and routes through `transferAndCall` (single tx) or `approve` + `wrap` (two txs) automatically — callers never pick the path. Don't compose `erc20.approve` + `wrapper.wrap` (or `erc20.transferAndCall`) by hand, don't branch on token address, and don't expose a per-call flag for it. See [`docs/gitbook/src/guides/shield-tokens.md`](docs/gitbook/src/guides/shield-tokens.md) for the routing table.
- **Unshielding (confidential → public ERC-20).** Use `WrappedToken.unshield` / `WrappedToken.unshieldAll` / `useUnshield` — they orchestrate the two-phase request-then-finalize flow. The lower-level `unwrap/*` hooks are escape hatches for callers that genuinely need per-phase control.
- **Transfer, balance, operators.** Same shape: `Token.confidentialTransfer`, `Token.balanceOf`, `Token.setOperator` and their hook equivalents (`useConfidentialTransfer`, `useConfidentialBalance`, …).

If the snippet you're about to generate composes the underlying contract calls for one of these flows, drop down to the `Token` method instead. The `examples/` apps are the ground truth and use the `Token` API throughout.

## Further reading

Load these on demand during planning — they are not preloaded:

- [`docs/agents/vision.md`](docs/agents/vision.md) — fuller product framing (scope, target users, framework-agnostic core, React-first hooks)
- [`docs/agents/architecture.md`](docs/agents/architecture.md) — repo layout, how operations flow through the system (balance, transfer, shield, unshield, routing)
- [`docs/agents/conventions.md`](docs/agents/conventions.md) — shared naming rules and design decisions (contracts-vs-tokens, Solidity-mirror params, pure contract call builders, stage-gate docs language, …)
- [`docs/agents/gotchas.md`](docs/agents/gotchas.md) — shared footguns: address normalization in query keys, PR base branch, shared-branch safety

Some packages add their own AGENTS.md with package-specific rules — they merge with this root file when you're working in that subtree:

- [`packages/react-sdk/AGENTS.md`](packages/react-sdk/AGENTS.md) — hook naming, three-layer architecture, first-decrypt UX, TanStack `useQueries` wrapper rule
