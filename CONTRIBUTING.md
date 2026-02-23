# Contributing to @zama-fhe/token-sdk

Thank you for your interest in contributing to the Zama Token SDK! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9

### Getting Started

```bash
# Clone the repository
git clone https://github.com/zama-ai/token-sdk.git
cd token-sdk

# Install dependencies
pnpm install

# Build all packages (order matters: token-sdk first)
pnpm build

# Run tests
pnpm test:run
```

### Monorepo Structure

```
packages/
  token-sdk/          # Core SDK
  token-react-sdk/    # React hooks
  test-app/           # E2E test app (Playwright + Hardhat)
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

### Running Tests

```bash
# All tests (watch mode)
pnpm test

# Single run
pnpm test:run

# Specific file
pnpm test:run -- packages/token-sdk/src/token/__tests__/token.test.ts

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
5. **Add a changeset** — run `pnpm changeset` to describe your change for the changelog

### Changesets

We use [Changesets](https://github.com/changesets/changesets) for versioning:

```bash
pnpm changeset
```

Select the affected packages and describe the change. Choose the appropriate semver bump:

- **patch** — bug fixes, documentation
- **minor** — new features, non-breaking additions
- **major** — breaking changes to public APIs

## Architecture Guidelines

### Key Design Principles

- **Framework-agnostic core** — `token-sdk` defines the `GenericSigner` interface; library-specific adapters (viem, ethers, wagmi) implement it
- **Contract call builders** — pure functions returning `ContractCallConfig` objects, composed by library-specific sub-paths
- **Error hierarchy** — all SDK errors extend `TokenError` with typed error codes; use specific subclasses (`EncryptionFailedError`, `SigningRejectedError`, etc.)

### Adding a New Signer Adapter

1. Implement the `GenericSigner` interface in a new file under `packages/token-sdk/src/<library>/`
2. Add a corresponding entry point in `package.json` exports
3. Configure tsup to build the new entry point
4. Add tests

### Adding React Hooks

1. Provider-based hooks go in `packages/token-react-sdk/src/token/` or `src/relayer/`
2. Library-specific hooks go in `packages/token-react-sdk/src/<library>/`
3. Export from the appropriate `index.ts`

## Reporting Issues

Use [GitHub Issues](https://github.com/zama-ai/token-sdk/issues) for bug reports and feature requests. Please include:

- Steps to reproduce
- Expected vs actual behavior
- SDK version and environment details

## License

By contributing, you agree that your contributions will be licensed under the [BSD-3-Clause License](LICENSE).
