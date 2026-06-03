# Contributing to @zama-fhe/sdk

Thank you for your interest in contributing to the Zama SDK! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 10
- **Foundry** >= 1.0.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/zama-ai/sdk.git
cd sdk

# Install dependencies
pnpm install

# Build all packages (order matters: sdk first)
pnpm build

# Run tests
pnpm test:run
```

### Monorepo Structure

```
packages/
  sdk/          # Core SDK
  react-sdk/    # React hooks
  test-nextjs/           # E2E test app (Playwright + Hardhat)
```

## Development Workflow

### Branch Naming

Use descriptive branch names:

- `feat/add-batch-transfer` for features
- `fix/credential-expiration` for bug fixes
- `docs/update-readme` for documentation
- `refactor/signer-interface` for refactoring

### Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all checks pass:

```bash
pnpm typecheck    # Type checking
pnpm lint         # ESLint
pnpm format:check # Prettier formatting
pnpm test:run     # Unit tests
pnpm build        # Build output
```

4. Open a pull request

### LLM Documentation Artifacts

The repository publishes generated LLM entry points for coding agents:

- `llms.txt` — compact discovery index with raw GitHub links
- `llms-full.txt` — full public documentation bundle for large-context agents
- `docs/llm/corpus-manifest.json` — generated manifest used to build both files

When changing SDK docs, approved example docs, package READMEs, API reports, or the LLM corpus scripts, run:

```bash
pnpm llm:build
pnpm llm:check
```

The pre-commit hook regenerates and stages the LLM artifacts automatically when relevant staged sources change. If a corpus source is partially staged, stage or discard the remaining changes before committing so the generated files match the committed source state.

### Running Tests

```bash
# All tests (watch mode)
pnpm test

# Single run
pnpm test:run

# Specific file
pnpm test:run -- packages/sdk/src/token/__tests__/token.test.ts

# With coverage
pnpm test:coverage

# E2E tests (requires build first; auto-starts hardhat + next dev)
pnpm e2e:test
```

### Code Style

- **ESM-only** — all packages use `"type": "module"`
- **Prettier + ESLint** — enforced via pre-commit hooks (Husky + lint-staged)
- **Unused variables** — prefix with `_` (e.g., `_unused`)
- **Tests** — place in `__tests__/` directories adjacent to source files, use vitest with `vi.fn()` for mocks
- **React SDK** — all source files use `"use client"` directive

## Pull Request Process

1. **Keep PRs focused** — one feature or fix per PR
2. **Add tests** — new features and bug fixes should include tests
3. **Update types** — if you change public APIs, update TypeScript types accordingly
4. **Run all checks** — ensure `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build` passes
5. **Use a Conventional Commit PR title** — examples: `fix: handle signer timeout`, `feat(react-sdk): add cached token balance hook`

### Release Automation

We use [semantic-release](https://semantic-release.gitbook.io/semantic-release/) for automated versioning and publishing.

Release behavior:

1. PR titles are validated against Conventional Commits.
2. Squash-merging into a release branch (`main` or `prerelease`) preserves that title as the release signal.
3. semantic-release computes the next version (`patch`/`minor`/`major`) from merged commits. Breaking changes must be signaled with `!` in the PR title (e.g. `feat!: drop deprecated API`); `BREAKING CHANGE:` text in commit bodies is preserved in the changelog but does not affect the version bump.
4. `@zama-fhe/sdk` and `@zama-fhe/react-sdk` are versioned and published together in lockstep.
5. `main` publishes stable versions to npm `latest`, while `prerelease` publishes prerelease versions to npm `alpha`.
6. GitHub release notes and tags are generated automatically.

Release workflows:

- `Release` (`.github/workflows/release.yml`): automatic publish on push to `main` and `prerelease`, gated by `Vitest` and `Playwright`.
- `Release (Manual)` (`.github/workflows/release-manual.yml`): manual publish restricted to `main` and `prerelease`, with the same `Vitest` + `Playwright` gates before publishing. Shares a concurrency group with `Release` to prevent simultaneous publishes on the same ref.
- `Release Preview` (`.github/workflows/release-preview.yml`): manual dry-run restricted to `main` and `prerelease` (`pnpm release:dry-run`), no publish side effects.

Install channels:

- Stable: `npm i @zama-fhe/sdk`
- Prerelease: `npm i @zama-fhe/sdk@alpha`

Maintainer requirements:

- Configure branch protection on `main` to require both `Vitest` and `Playwright` checks before merge.
- Configure branch protection on `prerelease` with the same required checks.
- Configure npm trusted publishers for `@zama-fhe/sdk` and `@zama-fhe/react-sdk` pointing to this repository's `release.yml` and `release-manual.yml` workflows.

## Architecture Guidelines

### Key Design Principles

- **Framework-agnostic core** — `sdk` defines the `GenericSigner` interface; library-specific adapters (viem, ethers, wagmi) implement it
- **Contract call builders** — pure functions returning `ContractCallConfig` objects, composed by library-specific sub-paths
- **Error hierarchy** — all SDK errors extend `TokenError` with typed error codes; use specific subclasses (`EncryptionFailedError`, `SigningRejectedError`, etc.)

### Adding a New Signer Adapter

1. Implement the `GenericSigner` interface in a new file under `packages/sdk/src/<library>/`
2. Add a corresponding entry point in `package.json` exports
3. Configure tsup to build the new entry point
4. Add tests

### Adding React Hooks

1. Provider-based hooks go in `packages/react-sdk/src/token/` or `src/relayer/`
2. Library-specific hooks go in `packages/react-sdk/src/<library>/`
3. Export from the appropriate `index.ts`

## Reporting Issues

Use [GitHub Issues](https://github.com/zama-ai/sdk/issues) for bug reports and feature requests. Please include:

- Steps to reproduce
- Expected vs actual behavior
- SDK version and environment details

## License

By contributing, you agree that your contributions will be licensed under the [BSD-3-Clause-Clear License](LICENSE).
