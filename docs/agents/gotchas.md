# Gotchas

Non-obvious things that have caused real bugs or friction.

- **Address normalization in query keys.** All addresses in query keys must use `getAddress()` for checksumming. Inconsistent casing causes cache misses.
- **Never delete or rename `main`, `prerelease`, or `release/*` branches locally** — they're shared across worktrees and tooling. If a tool needs a specific branch name for verification, use a throwaway name or a `/tmp` clone.
- **PR base defaults to `prerelease`**, not `main`. `main` is reserved for release/CI infrastructure PRs (`.releaserc*`, `scripts/release/`, release workflows). Product and feature work targets `prerelease`.
- **Build order is load-bearing.** `react-sdk` resolves against the sdk dist output at build time. Always run `pnpm build:sdk` before `pnpm build:react-sdk`; `pnpm build` does this automatically. Running `build:react-sdk` alone on a clean checkout will fail.
- **Two separate `IndexedDBStorage` instances required.** `ZamaProvider` takes both `storage` (keypair persistence) and `sessionStorage` (session/credential cache) props — these must be separate `IndexedDBStorage` instances with different store names. Passing the same instance for both causes the session entry to overwrite the encrypted keypair, forcing a fresh EIP-712 sign on every balance decrypt.
- **`GenericSigner` is wallet-only; `GenericProvider` is chain-reads-only.** `readContract`, `waitForTransactionReceipt`, and `getBlockTimestamp` live on `GenericProvider` (`types/provider.ts`), not `GenericSigner`. Custom adapter implementations must split these correctly or the SDK's read/write routing breaks.
- **Chain presets are plain strings, not config objects.** The chain presets exported from `@zama-fhe/sdk/chains` are named `sepolia`, `hoodi`, `mainnet`, `hardhat`, and `anvil` — not `SepoliaConfig`, `HoodiConfig`, etc. Use `import { sepolia } from "@zama-fhe/sdk/chains"`.

> React-sdk has its own gotchas (TanStack `useQueries` wrapper, etc.) — see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).
