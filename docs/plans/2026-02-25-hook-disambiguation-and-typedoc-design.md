# Hook Disambiguation & TypeDoc API Docs — Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

1. **Hook naming ambiguity** — Five React hooks (`useConfidentialTransfer`, `useShield`, `useShieldETH`, `useUnwrap`, `useFinalizeUnwrap`) exist in both the provider layer (`@zama-fhe/react-sdk`) and the adapter layers (`/viem`, `/ethers`, `/wagmi`). They share names but have fundamentally different semantics: provider hooks auto-encrypt, manage caches, and require `ZamaProvider`; adapter hooks are raw contract wrappers requiring pre-encrypted inputs and no provider. A consumer importing from the wrong path gets silent wrong behavior.

2. **No generated API docs** — READMEs are hand-maintained and drift from the source. No TypeDoc, API Extractor, or doc-gen tooling exists. JSDoc coverage on public APIs is already decent (`@example` blocks on all `Token`/`ReadonlyToken` methods), but there's no pipeline to turn it into browsable reference docs.

## Decisions

- **Hook disambiguation: docs-only fix.** No renames. The adapter hooks are an advanced escape hatch; most users never touch them. A decision tree and comparison table in the README is proportionate.
- **API docs: TypeDoc with HTML output.** Greenfield setup. One `typedoc.json` at repo root, multi-package config, `pnpm docs` script. Output to `docs/api/` (gitignored). CI/GitHub Pages deploy deferred to a follow-up.

## Design

### 1. Hook Decision Tree (react-sdk README)

Add a new section after "Provider Setup" titled **"Which hooks should I use?"**.

Contents:

- **Decision tree:** "Are you using `ZamaProvider`?" → Yes → import from `@zama-fhe/react-sdk` (high-level). No → import from the library-specific sub-path (low-level).
- **Comparison table** for the 5 colliding hooks showing: import path, mutate params, auto-encryption, cache invalidation, provider dependency.
- **Callout:** Never mix provider and adapter hooks for the same operation.

No code changes. No renames.

### 2. TypeDoc Setup

**Config:** `typedoc.json` at repo root using `packages` mode. Entry points:

- `packages/sdk/src/index.ts` (main)
- `packages/sdk/src/viem/index.ts`
- `packages/sdk/src/ethers/index.ts`
- `packages/sdk/src/node/index.ts`
- `packages/react-sdk/src/index.ts` (main)
- `packages/react-sdk/src/viem/index.ts`
- `packages/react-sdk/src/ethers/index.ts`
- `packages/react-sdk/src/wagmi/index.ts`

**Output:** HTML to `docs/api/` (added to `.gitignore`).

**Scripts:** `pnpm docs` at root.

**TSDoc gap-filling:**

- Add `@param` and `@returns` tags to core SDK public methods (`Token`, `ReadonlyToken`, `ZamaSDK`) where currently missing.
- Add `@packageDocumentation` to each entry-point `index.ts`.
- React-sdk hooks already have decent `@param`/`@returns` coverage — light pass only.

**Not in scope:** CI pipeline, GitHub Pages deploy, `@internal`/`@public` visibility markers.
