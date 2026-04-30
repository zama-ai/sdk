# Gotchas

Non-obvious things that have caused real bugs or friction.

- **Address normalization in query keys.** All addresses in query keys must use `getAddress()` for checksumming. Inconsistent casing causes cache misses.
- **Never delete or rename `main`, `prerelease`, or `release/*` branches locally** — they're shared across worktrees and tooling. If a tool needs a specific branch name for verification, use a throwaway name or a `/tmp` clone.
- **PR base defaults to `prerelease`**, not `main`. `main` is reserved for release/CI infrastructure PRs (`.releaserc*`, `scripts/release/`, release workflows). Product and feature work targets `prerelease`.
- **Two separate `IndexedDBStorage` stores required.** `createConfig()` accepts both `storage` (keypair persistence) and `sessionStorage` (session/credential cache) as optional fields. If you override either, use distinct store names — the defaults are `"CredentialStore"` and `"SessionStore"`. Sharing the same store name causes the session entry to overwrite the encrypted keypair, forcing a fresh EIP-712 sign on every balance decrypt. Omitting both is safe.
- **`GenericSigner` is wallet-only; `GenericProvider` is chain-reads-only.** `readContract`, `waitForTransactionReceipt`, and `getBlockTimestamp` live on `GenericProvider` (`types/provider.ts`), not `GenericSigner`. Custom adapter implementations must split these correctly or the SDK's read/write routing breaks.
- **`signTypedData`: strip `EIP712Domain` from `types` before calling `walletClient.signTypedData`.** Viem injects it automatically from the `domain` field — passing it in `types` causes a signature mismatch that surfaces as a credential rejection at decrypt time.
- **Chain preset export names have no `Config` suffix.** The chain presets exported from `@zama-fhe/sdk/chains` (and re-exported from the main entry) are named `sepolia`, `hoodi`, `mainnet`, `hardhat`, and `anvil`. Use `import { sepolia } from "@zama-fhe/sdk/chains"` or `import { sepolia } from "@zama-fhe/sdk"`. The `SepoliaConfig`/`HoodiConfig` names existed in the published v3.0.0 and have been renamed in the prerelease.

> React-sdk has its own gotchas (TanStack `useQueries` wrapper, etc.) — see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).
