# Architecture

## Repository layout

**For SDK users:** `packages/sdk/` is the core SDK, `packages/react-sdk/` is the React hooks layer, and `examples/` has working integration examples (react-viem, react-wagmi, react-ethers, node-viem, node-ethers).

**For SDK developers and agents:** `contracts/` has the Solidity smart contracts (Foundry/forge) — ERC-7984 confidential tokens, wrappers, registries, batchers. `test/` has E2E infrastructure (Playwright, Next.js/Vite test apps, shared React test components). `tools/ast-grep/` has custom AST lint rules. `claude-setup/` has agent configuration (copied to `.claude/` by `pnpm setup:claude`). `docs/gitbook/` has user-facing documentation. `docs/agents/` has this guidance.

## How operations flow

The directory structure is shallow, so understanding how data moves through the system requires knowing the layers.

**SDK layers:** `ZamaSDK` orchestrates `provider` (read-only RPC: `ViemProvider`, `EthersProvider`, `WagmiProvider`), `signer` (wallet: `ViemSigner`, `EthersSigner`, `WagmiSigner`), `relayer` (encrypt/decrypt backend), `storage` (credential store), and a `CredentialsManager`. `ZamaSDK` creates `Token` / `ReadonlyToken` instances that share these. `Token` (write ops) and `ReadonlyToken` (read ops) fetch encrypted handles via `sdk.provider.readContract` and go through `sdk.userDecrypt` / `sdk.publicDecrypt` for decryption. React hooks follow a three-layer pattern: core action (`packages/sdk/src/query/`) → query options factory → framework hook (`packages/react-sdk/src/`).

**Balance flow:** `useConfidentialBalance` runs a single `useQuery` whose `queryFn` calls `ReadonlyToken.balanceOf(owner)`. That method reads the encrypted handle from the host-chain RPC and then calls `sdk.userDecrypt([{ handle, contractAddress }])` to get the plaintext — both in one pass, no separate polling phase. EIP-712 credentials are required for decryption: the first decrypt per session needs an explicit user click, and subsequent decrypts reuse the cached credentials. Plaintext balances are cached by React Query in memory; there is no on-disk balance cache.

**Transfer:** encrypt amount via relayer → single contract call → wait for receipt.

**Shield (public ERC-20 → confidential ERC-7984):** approve underlying ERC-20 → wrap into confidential token.

**Unshield (confidential → public):** two-phase — request (encrypt + contract call) then finalize (after off-chain processing).

**Transparent routing:** the SDK routes between host-chain RPC and Relayer API automatically. Callers never choose which backend to use. The decision is made at initialization: `RelayerWeb` for browser (Web Worker), `RelayerNode` for Node.js (worker_threads).
