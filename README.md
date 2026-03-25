# Zama SDK

![Latest dev release](https://img.shields.io/npm/v/%40zama-fhe%2Fsdk/alpha?label=dev%20release)
![Latest dev release last updated](https://img.shields.io/npm/last-update/%40zama-fhe%2Fsdk/alpha)
![NPM License](https://img.shields.io/npm/l/%40zama-fhe%2Fsdk)
[![Unit tests](https://github.com/zama-ai/sdk/actions/workflows/vitest.yml/badge.svg)](https://github.com/zama-ai/sdk/actions/workflows/vitest.yml)
[![E2E tests](https://github.com/zama-ai/sdk/actions/workflows/playwright.yml/badge.svg)](https://github.com/zama-ai/sdk/actions/workflows/playwright.yml)

TypeScript SDKs for privacy-preserving confidential contract operations using [Fully Homomorphic Encryption on Zama Protocol](https://docs.zama.org/protocol/protocol/overview). Shield, transfer, and unshield tokens with encrypted balances — no one sees your amounts on-chain.

## Packages

| Package                                        | Description                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`@zama-fhe/sdk`](./packages/sdk/)             | Core SDK — confidential contract operations, FHE relayer, contract call builders, viem/ethers adapters, Node.js worker pool |
| [`@zama-fhe/react-sdk`](./packages/react-sdk/) | React hooks wrapping the core SDK via `@tanstack/react-query`, with viem/ethers/wagmi sub-paths                          |

## Install

```bash
# Core SDK (vanilla TypeScript)
pnpm add @zama-fhe/sdk
# or: npm install @zama-fhe/sdk / yarn add @zama-fhe/sdk

# React hooks
pnpm add @zama-fhe/react-sdk @tanstack/react-query
# or: npm install @zama-fhe/react-sdk @tanstack/react-query / yarn add @zama-fhe/react-sdk @tanstack/react-query
```

## Documentation

Full documentation — tutorials, API reference, integration guides, and examples — is available via a local preview:

```bash
pnpm install
pnpm docs:preview
```

> The docs will eventually be published to [docs.zama.org](https://docs.zama.org). Until then, serve them locally with the command above.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contributor guide (branching, PRs, code style, architecture).

### Prerequisites

- Node.js >= 22
- pnpm >= 10

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build                  # Build all (sdk first, then react-sdk)
pnpm build:sdk              # Build core SDK only
pnpm build:react-sdk        # Build React SDK only
```

### Test

```bash
pnpm test              # Watch mode
pnpm test:run          # Single run
pnpm typecheck         # Type checking
pnpm lint              # Linting
pnpm format:check      # Formatting check
```

### E2E Tests

```bash
pnpm submodule:init    # Initialize hardhat submodule (first time)
pnpm hardhat:install   # Install hardhat dependencies
pnpm e2e:test          # Run E2E tests (auto-starts hardhat + next dev)
pnpm e2e:test:ui       # Playwright UI mode
```

## Claude Code Setup

This repository includes an opt-in [Claude Code](https://docs.anthropic.com/en/docs/claude-code) configuration in `claude-setup/settings.json`. It provides:

- **Auto-allowed commands** — `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`, and git diff variants run without prompting.
- **Denied reads** — `.env` files and `.next/` are blocked to prevent accidental secret exposure.
- **Ask-before-running** — destructive commands (`rm`), remote pushes (`git push`), and release commands require explicit approval.
- **Post-edit hooks** — every file write/edit automatically triggers `pnpm typecheck`, `pnpm lint`, and `pnpm format`.
- **Custom skills** — custom skills required for good development practices to contribute to this repo.

To use it, install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and run `pnpm setup:claude`.

## License

[BSD-3-Clause-Clear](./LICENSE)
