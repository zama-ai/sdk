# Architecture

## Repository layout

**For SDK users:** `packages/sdk/` is the core SDK, `packages/react-sdk/` is the React hooks layer, and `examples/` has approved working integrations across React (wagmi, viem, ethers) and Node.js (viem, ethers) stacks.

**For SDK developers and agents:** `contracts/` has the Solidity smart contracts (Foundry/forge) — ERC-7984 confidential tokens, wrappers, registries, batchers. `test/` has E2E infrastructure (Playwright, Next.js/Vite test apps, shared React test components). `tools/ast-grep/` has custom AST lint rules. `claude-setup/` has agent configuration (copied to `.claude/` by `pnpm setup:claude`). `docs/gitbook/` has user-facing documentation. `docs/agents/` has this guidance. For react-sdk hook design rules and gotchas, see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).

## How operations flow

The directory structure is shallow, so understanding how data moves through the system requires knowing the layers.

**SDK layers:** `ZamaSDK` orchestrates a read-only chain provider, an optional wallet signer (read-only flows work without one; write operations require it), an encrypt/decrypt relayer backend, credential storage, and a `CredentialsManager`. `ZamaSDK` creates `Token` / `WrappedToken` instances that share these. `Token` (base ERC-7984 reads + transfer/operator) and `WrappedToken extends Token` (adds shield/unshield/unwrap/allowance for ERC-7984 ERC-20 wrappers) fetch encrypted handles from the chain via the provider, and go through `sdk.decryption.userDecrypt` / `sdk.decryption.publicDecrypt` primitives for decryption. React hooks follow a three-layer pattern: core action (`packages/sdk/src/query/`) → query options factory → framework hook (`packages/react-sdk/src/`).

**Balance flow:** `useConfidentialBalance` runs a single `useQuery` whose `queryFn` calls `Token.balanceOf(owner)`. That method reads the encrypted value from the host-chain RPC and then calls `sdk.decryption.userDecrypt([{ encryptedValue, contractAddress }])` to get the plaintext — both in one pass, no separate polling phase. EIP-712 credentials are required for decryption: the first decrypt per session needs an explicit user click, and subsequent decrypts reuse the cached credentials. Plaintext balances are cached by React Query in memory; there is no on-disk balance cache.

**Transfer:** encrypt amount via relayer → single contract call → wait for receipt.

**Shield (public ERC-20 → confidential ERC-7984):** `WrappedToken.shield()` is the public API. Internally the SDK detects ERC-1363 support on the underlying ERC-20 and either calls `transferAndCall` on the underlying (single tx; the wrapper's `onTransferReceived` mints the confidential balance) or falls back to `approve` + `wrap` (two txs). Callers never pick the path — `approvalStrategy` only applies on the `approve` + `wrap` branch. See [`docs/gitbook/src/guides/shield-tokens.md`](../gitbook/src/guides/shield-tokens.md) for the per-token routing table.

**Unshield (confidential → public):** two-phase — request (encrypt + contract call) then finalize (after off-chain processing).

**Transparent routing:** the SDK routes between host-chain RPC and Relayer API automatically. Callers never choose which backend to use. Multiple relayer implementations exist (browser, Node.js, multichain), but all expose the same `RelayerSDK` interface, so SDK and Token code never branches on the runtime.
