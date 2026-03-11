# SDK Architecture

The Zama SDK provides confidential ERC-20 token operations using Fully Homomorphic Encryption (FHE). It hides FHE complexity behind a familiar token API — shield, transfer, unshield — with swappable signer adapters, pluggable storage backends, and browser/server support via Web Workers and WASM.

## Architecture Layers

> D2 source: [`docs/diagrams/layers.d2`](diagrams/layers.d2)

![Zama SDK Architecture Layers](diagrams/layers.svg)

### UI Layer

`@zama-fhe/react-sdk` provides React hooks wrapping every SDK operation. `ZamaProvider` initializes the SDK and sets up React Query for caching and deduplication. Query hooks (`useConfidentialBalance`, `useMetadata`) handle read operations; mutation hooks (`useShield`, `useConfidentialTransfer`, `useUnshield`) handle writes.

**Key files:** `packages/react-sdk/src/provider.tsx`, `packages/react-sdk/src/token/`

### Query & Mutation Factories

Framework-agnostic `queryOptions` and `mutationOptions` factories that can be consumed by React Query or used directly. Includes centralized query key management (`zamaQueryKeys`) and cache invalidation helpers.

**Key files:** `packages/sdk/src/query/`

### Token Abstraction

`ZamaSDK` is the entry point — a factory that creates `Token` (write operations) and `ReadonlyToken` (read operations) instances. `Token` provides the ERC-20-like API: `shield()`, `transfer()`, `unshield()`. `ReadonlyToken` handles `balanceOf()`, `allowance()`, and metadata queries.

**Key files:** `packages/sdk/src/token/zama-sdk.ts`, `packages/sdk/src/token/token.ts`, `packages/sdk/src/token/readonly-token.ts`

### Contract Call Builders

Pure functions that construct transaction payloads for each contract interaction. Each builder takes parameters and returns a `ContractCallConfig` that signers can execute. Organized by concern: ERC-20 (`approve`, `balanceOf`), Wrapper (`shield`, `unwrap`), Encryption (`confidentialTransfer`, `confidentialBalanceOf`), Fees, Batching, Interface Detection (ERC-165), Deployment Coordinator.

**Key files:** `packages/sdk/src/contracts/`

### Signer Adapters

`GenericSigner` is the trait that all signer adapters implement. Each adapter translates SDK operations into library-specific calls: `ViemSigner` wraps viem's `walletClient`, `EthersSigner` wraps ethers.js `Signer`, `WagmiSigner` (in react-sdk) wraps wagmi hooks. Adapters handle `writeContract()`, `signTypedData()` (EIP-712), and `readContract()`.

**Key files:** `packages/sdk/src/viem/viem-signer.ts`, `packages/sdk/src/ethers/ethers-signer.ts`, `packages/react-sdk/src/wagmi/`

### Relayer

`RelayerWeb` (browser) and `RelayerNode` (server) manage FHE operations: keypair generation, encryption, and decryption. They delegate computation to the Worker layer and handle chain switching. `RelayerCleartext` provides a testing relayer for local development with mock FHE operations. `RelayerWeb` uses a Promise Lock to serialize concurrent operations during worker initialization.

**Key files:** `packages/sdk/src/relayer/relayer-web.ts`, `packages/sdk/src/relayer/relayer-node.ts`, `packages/sdk/src/relayer/cleartext/`

### Worker Layer

Browser: a Web Worker running `@zama-fhe/relayer-sdk` WASM for FHE computation, communicating via RPC messages. Node.js: `RelayerNodePool` manages a pool of `worker_threads` for concurrent crypto operations.

**Key files:** `packages/sdk/src/worker/worker.client.ts`, `packages/sdk/src/worker/relayer-sdk.worker.ts`, `packages/sdk/src/worker/worker.node-pool.ts`

### Storage & Credentials

`CredentialsManager` handles the FHE keypair lifecycle: generate, encrypt (AES-GCM with key derived from wallet signature via PBKDF2), store, reload, and refresh on expiry. Storage backends are swappable: `IndexedDBStorage` for browser persistence, `MemoryStorage` for tests, `AsyncLocalStorage` for Node.js, `ChromeSessionStorage` for web extensions.

**Key files:** `packages/sdk/src/token/credentials-manager.ts`, `packages/sdk/src/token/balance-cache.ts`

### Event System

`ZamaSDKEvents` emits structured lifecycle events (credentials loading/cached/expired, encrypt/decrypt start/end/error, transaction submitted). On-chain event decoders parse `Transfer`, `Wrapped`, `UnwrapRequested` logs. The event system is mostly standalone — only depends on `Address`/`Hex` types from the relayer module.

**Key files:** `packages/sdk/src/events/sdk-events.ts`, `packages/sdk/src/events/onchain-events.ts`

---

## Core SDK Module Map

> D2 source: [`docs/diagrams/sdk-modules.d2`](diagrams/sdk-modules.d2)

![SDK Module Map](diagrams/sdk-modules.svg)

**Dependency direction is acyclic.** `abi/` is fully standalone (pure data). `events/` is mostly standalone. `worker/` sits at the bottom of the crypto stack. `query/` wraps the token layer for framework-agnostic data fetching. `token/` is the orchestrator that connects all layers.

---

## React SDK Module Map

> D2 source: [`docs/diagrams/react-sdk-modules.d2`](diagrams/react-sdk-modules.d2)

![React SDK Module Map](diagrams/react-sdk-modules.svg)

`ZamaProvider` creates and holds the `ZamaSDK` instance. Query and mutation hooks consume the query/mutation factories from `@zama-fhe/sdk/query`. The `/wagmi` sub-path provides `WagmiSigner`.

---

## Key Design Patterns

| Pattern                | Where                                   | Why                                                                               |
| ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| **Factory**            | `ZamaSDK` → `Token`/`ReadonlyToken`     | Centralizes construction, injects relayer + signer + storage consistently         |
| **Adapter**            | `GenericSigner`, `GenericStringStorage` | Swappable wallet libraries and storage backends without changing core logic       |
| **Query Factory**      | `@zama-fhe/sdk/query`                   | Framework-agnostic data fetching patterns consumable by React Query or directly   |
| **Worker Pool**        | `RelayerNodePool`                       | Distributes CPU-intensive FHE operations across Node.js worker threads            |
| **Promise Lock**       | `RelayerWeb.#ensureLock`                | Serializes concurrent operations during worker init and chain switching           |
| **Observer**           | `ZamaSDKEvents`                         | Streams lifecycle events for observability without coupling to specific telemetry |
| **Cache + Encryption** | `CredentialsManager`                    | AES-GCM encrypts private keys at rest; session cache avoids re-derivation         |
