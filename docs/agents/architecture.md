# Architecture

## Repository layout

**For SDK users:** `packages/sdk/` is the core SDK, `packages/react-sdk/` is the React hooks layer, and `examples/` has working integration examples (react-viem, react-wagmi, react-ethers, node-viem, node-ethers).

**For SDK developers and agents:** `contracts/` has the Solidity smart contracts (Foundry/forge) — ERC-7984 confidential tokens, wrappers, registries, batchers. `test/` has E2E infrastructure (Playwright, Next.js/Vite test apps, shared React test components). `tools/ast-grep/` has custom AST lint rules. `claude-setup/` has agent configuration (copied to `.claude/` by `pnpm setup:claude`). `docs/gitbook/` has user-facing documentation. `docs/agents/` has this guidance.

## How operations flow

The directory structure is shallow, so understanding how data moves through the system requires knowing the layers.

**SDK layers:** `ZamaSDK` orchestrates signer + relayer + storage + credentials, and creates `Token` instances that share credentials. `Token` (write ops) and `ReadonlyToken` (read ops) coordinate between host-chain RPC (for encrypted handles) and the Relayer (for encrypt/decrypt via Web Workers). React hooks follow a three-layer pattern: core action (`packages/sdk/src/query/`) → query options factory → framework hook (`packages/react-sdk/src/`).

**Balance flow (two-phase):** Phase 1 is a cheap RPC poll for the encrypted handle (no signing needed). Phase 2 triggers an expensive relayer decrypt only when the handle changes — this requires EIP-712 credentials (first time needs an explicit user click, then cached). Cache hierarchy: React Query (memory) → IndexedDB balance cache → encrypted credential store → relayer.

**Transfer:** encrypt amount via relayer → single contract call → wait for receipt.

**Shield (public ERC-20 → confidential ERC-7984):** approve underlying ERC-20 → wrap into confidential token.

**Unshield (confidential → public):** two-phase — request (encrypt + contract call) then finalize (after off-chain processing).

**Transparent routing:** the SDK routes between host-chain RPC and Relayer API automatically. Callers never choose which backend to use. The decision is made at initialization: `RelayerWeb` for browser (Web Worker), `RelayerNode` for Node.js (worker_threads).
