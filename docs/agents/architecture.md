# Architecture

## Repository layout

**For SDK users:** `packages/sdk/` is the core SDK, `packages/react-sdk/` is the React hooks layer, and `examples/` has official working integration examples:

| Example         | Stack                                          |
| --------------- | ---------------------------------------------- |
| `react-wagmi`   | React + wagmi + viem                           |
| `react-viem`    | React + viem                                   |
| `react-ethers`  | React + ethers                                 |
| `node-viem`     | Node.js + viem                                 |
| `node-ethers`   | Node.js + ethers                               |
| `example-hoodi` | React + ethers (Hoodi testnet, cleartext mode) |

**For SDK developers and agents:** `contracts/` has the Solidity smart contracts (Foundry/forge) — ERC-7984 confidential tokens, wrappers, registries, batchers. `test/` has E2E infrastructure (Playwright, Next.js/Vite test apps, shared React test components). `tools/ast-grep/` has custom AST lint rules. `claude-setup/` has agent configuration (copied to `.claude/` by `pnpm setup:claude`). `docs/gitbook/` has user-facing documentation. `docs/agents/` has this guidance.

## Source layout

### packages/sdk/src/

Entry points exported by the package: `@zama-fhe/sdk` (main), `/viem`, `/ethers`, `/chains`, `/web`, `/node`, `/query`, `/cleartext`.

```
types/          → GenericSigner (signer.ts), GenericProvider (provider.ts), all supporting types
token/          → Token and ReadonlyToken (shield, unshield, confidentialTransfer, balanceOf)
relayer/        → RelayerWeb (via /web), RelayerNode (via /node), RelayerCleartext (via /cleartext)
viem/           → ViemSigner (GenericSigner), ViemProvider (GenericProvider)
ethers/         → EthersSigner (GenericSigner), EthersProvider (GenericProvider)
credentials/    → session management, credential signing
query/          → core async actions (layer 1 of the three-layer React hook pattern)
storage/        → IndexedDBStorage, MemoryStorage
worker/         → Web Worker + Node.js thread pool (offloads heavy FHE operations)
chains/         → network presets: sepolia, hoodi, mainnet, hardhat, anvil
errors/         → error hierarchy (TokenError and subclasses)
```

### packages/react-sdk/src/

Entry points exported by the package: `@zama-fhe/react-sdk` (main), `/wagmi`.

For React-sdk hook design rules, naming conventions, and package-specific gotchas, see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).

## Commands

```bash
# Build — sdk must be built before react-sdk (react-sdk resolves against sdk dist)
pnpm build                   # both packages in order
pnpm build:sdk               # @zama-fhe/sdk only
pnpm build:react-sdk         # @zama-fhe/react-sdk only (sdk must be built first)

# Test
pnpm test                    # vitest — watch mode
pnpm test:run                # single run
pnpm test:integration        # runs packages/**/__tests__/*.integration.test.ts
pnpm e2e:test                # Playwright E2E (requires build first)

# Code quality
pnpm typecheck               # tsc --noEmit across all packages in parallel
pnpm lint                    # oxlint + ast-grep scan
pnpm lint:fix                # oxlint --fix --fix-suggestions
pnpm format                  # oxfmt (auto-format)
pnpm format:check            # verify formatting (CI)

# Required after specific changes — CI blocks merges if either is stale
pnpm api-report              # regenerate API surface reports; run after any public API change
pnpm llm:build               # regenerate llms.txt + llms-full.txt; run when docs/, examples/, or package READMEs change
```

## How operations flow

The directory structure is shallow, so understanding how data moves through the system requires knowing the layers.

**SDK layers:** `ZamaSDK` orchestrates a read-only chain provider, an optional wallet signer (read-only flows work without one; write operations require it), an encrypt/decrypt relayer backend, credential storage, and a `CredentialsManager`. `ZamaSDK` creates `Token` / `ReadonlyToken` instances that share these. `Token` (write ops) and `ReadonlyToken` (read ops) fetch encrypted handles from the chain via the provider, and go through `sdk.userDecrypt` / `sdk.publicDecrypt` primitives for decryption. React hooks follow a three-layer pattern: core action (`packages/sdk/src/query/`) → query options factory → framework hook (`packages/react-sdk/src/`).

**Balance flow:** `useConfidentialBalance` runs a single `useQuery` whose `queryFn` calls `ReadonlyToken.balanceOf(owner)`. That method reads the encrypted handle from the host-chain RPC and then calls `sdk.userDecrypt([{ handle, contractAddress }])` to get the plaintext — both in one pass, no separate polling phase. EIP-712 credentials are required for decryption: the first decrypt per session needs an explicit user click, and subsequent decrypts reuse the cached credentials. Plaintext balances are cached by React Query in memory; there is no on-disk balance cache.

**Transfer:** encrypt amount via relayer → single contract call → wait for receipt.

**Shield (public ERC-20 → confidential ERC-7984):** approve underlying ERC-20 → wrap into confidential token.

**Unshield (confidential → public):** two-phase — request (encrypt + contract call) then finalize (after off-chain processing).

**Transparent routing:** the SDK routes between host-chain RPC and Relayer API automatically. Callers never choose which backend to use. Multiple relayer implementations exist (browser, Node.js, multichain), but all expose the same `RelayerSDK` interface, so SDK and Token code never branches on the runtime.
