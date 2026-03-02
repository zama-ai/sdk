# SDK Architecture

The Zama SDK provides confidential ERC-20 token operations using Fully Homomorphic Encryption (FHE). It hides FHE complexity behind a familiar token API — shield, transfer, unshield — with swappable signer adapters, pluggable storage backends, and browser/server support via Web Workers and WASM.

## Architecture Layers

> D2 source: [`docs/diagrams/layers.d2`](diagrams/layers.d2)

```mermaid
graph TD
    subgraph UI["UI Layer (green)"]
        A["@zama-fhe/react-sdk<br/>ZamaProvider · hooks"]
        B["React Query<br/>@tanstack/react-query"]
    end

    subgraph Abstraction["Abstraction Layer (blue)"]
        C["Token Abstraction<br/>ZamaSDK · Token · ReadonlyToken"]
        D["Contract Call Builders<br/>shieldContract · confidentialTransferContract · ..."]
    end

    subgraph Integration["Integration Layer (orange)"]
        E["Signer Adapters<br/>ViemSigner · EthersSigner · WagmiSigner"]
    end

    subgraph Crypto["Crypto Layer (purple)"]
        F["Relayer<br/>RelayerWeb · RelayerNode"]
        G["Worker Layer<br/>Web Worker + WASM / Node Worker Pool"]
    end

    subgraph Persistence["Storage Layer (red)"]
        H["Storage & Credentials<br/>CredentialsManager · IndexedDB · Memory"]
    end

    subgraph External["External"]
        I["Blockchain<br/>viem / ethers.js RPC"]
    end

    J["Event System<br/>ZamaSDKEvents · On-chain Decoders"]

    A --> B
    B --> C
    C --> D
    C --> E
    C --> F
    C --> J
    D --> I
    E --> I
    F --> G
    C --> H

    style UI fill:#E8F5E9,stroke:#388E3C
    style Abstraction fill:#E3F2FD,stroke:#1565C0
    style Integration fill:#FFF3E0,stroke:#E65100
    style Crypto fill:#F3E5F5,stroke:#6A1B9A
    style Persistence fill:#FBE9E7,stroke:#BF360C
    style External fill:#ECEFF1,stroke:#37474F
```

### UI Layer

`@zama-fhe/react-sdk` provides React hooks wrapping every SDK operation. `ZamaProvider` initializes the SDK and sets up React Query for caching and deduplication. Query hooks (`useConfidentialBalance`, `useTokenMetadata`) handle read operations; mutation hooks (`useShield`, `useConfidentialTransfer`, `useUnshield`) handle writes.

**Key files:** `packages/react-sdk/src/provider.tsx`, `packages/react-sdk/src/token/`

### Token Abstraction

`ZamaSDK` is the entry point — a factory that creates `Token` (write operations) and `ReadonlyToken` (read operations) instances. `Token` provides the ERC-20-like API: `shield()`, `transfer()`, `unshield()`. `ReadonlyToken` handles `balanceOf()`, `allowance()`, and metadata queries.

**Key files:** `packages/sdk/src/token/zama-sdk.ts`, `packages/sdk/src/token/token.ts`, `packages/sdk/src/token/readonly-token.ts`

### Contract Call Builders

Pure functions that construct transaction payloads for each contract interaction. Each builder takes parameters and returns a `ContractCallConfig` that signers can execute. Organized by concern: ERC-20 (`approve`, `balanceOf`), Wrapper (`shield`, `unwrap`), Encryption (`confidentialTransfer`, `confidentialBalanceOf`), Fees, Batching.

**Key files:** `packages/sdk/src/contracts/`

### Signer Adapters

`GenericSigner` is the trait that all signer adapters implement. Each adapter translates SDK operations into library-specific calls: `ViemSigner` wraps viem's `walletClient`, `EthersSigner` wraps ethers.js `Signer`, `WagmiSigner` (in react-sdk) wraps wagmi hooks. Adapters handle `writeContract()`, `signTypedData()` (EIP-712), and `readContract()`.

**Key files:** `packages/sdk/src/viem/viem-signer.ts`, `packages/sdk/src/ethers/ethers-signer.ts`, `packages/react-sdk/src/wagmi/`

### Relayer

`RelayerWeb` (browser) and `RelayerNode` (server) manage FHE operations: keypair generation, encryption, and decryption. They delegate computation to the Worker layer and handle chain switching. `RelayerWeb` uses a Promise Lock to serialize concurrent operations during worker initialization.

**Key files:** `packages/sdk/src/relayer/relayer-web.ts`, `packages/sdk/src/relayer/relayer-node.ts`

### Worker Layer

Browser: a Web Worker running `@zama-fhe/relayer-sdk` WASM for FHE computation, communicating via RPC messages. Node.js: `RelayerNodePool` manages a pool of `worker_threads` for concurrent crypto operations.

**Key files:** `packages/sdk/src/worker/worker.client.ts`, `packages/sdk/src/worker/relayer-sdk.worker.ts`, `packages/sdk/src/worker/worker.node-pool.ts`

### Storage & Credentials

`CredentialsManager` handles the FHE keypair lifecycle: generate, encrypt (AES-GCM with key derived from wallet signature via PBKDF2), store, reload, and refresh on expiry. Storage backends are swappable: `IndexedDBStorage` for browser persistence, `MemoryStorage` for tests, `AsyncLocalStorage` for Node.js.

**Key files:** `packages/sdk/src/token/credential-manager.ts`, `packages/sdk/src/token/balance-cache.ts`

### Event System

`ZamaSDKEvents` emits structured lifecycle events (credentials loading/cached/expired, encrypt/decrypt start/end/error, transaction submitted). On-chain event decoders parse `Transfer`, `Wrapped`, `UnwrapRequested` logs. The event system is mostly standalone — only depends on `Address`/`Hex` types from the relayer module.

**Key files:** `packages/sdk/src/events/sdk-events.ts`, `packages/sdk/src/events/onchain-events.ts`

---

## Core SDK Module Map

> D2 source: [`docs/diagrams/sdk-modules.d2`](diagrams/sdk-modules.d2)

```mermaid
graph LR
    subgraph token["token/"]
        ZS[ZamaSDK] --> T[Token]
        ZS --> RT[ReadonlyToken]
        T --> CM[CredentialsManager]
        RT --> CM
        RT --> BC[BalanceCache]
    end

    subgraph contracts["contracts/"]
        ERC[ERC-20]
        WR[Wrapper]
        ENC[Encryption]
        FEE[Fee]
        BAT[Batcher]
    end

    subgraph relayer["relayer/"]
        RW[RelayerWeb]
        RN[RelayerNode]
        RU[relayer-utils]
    end

    subgraph worker["worker/"]
        WC[WorkerClient]
        NP[NodeWorkerPool]
    end

    subgraph events["events/"]
        SE[ZamaSDKEvents]
        OC[On-chain decoders]
    end

    ABI["abi/<br/>(pure data)"]
    STORAGE["storage/<br/>IndexedDB · Memory · AsyncLocal"]
    SIGNERS["viem/ · ethers/<br/>ViemSigner · EthersSigner"]

    token -->|"encrypt/decrypt"| relayer
    token -->|"emit events"| events
    token -->|"persistence"| STORAGE
    contracts -->|"ABI constants"| ABI
    relayer -->|"FHE ops"| worker
    SIGNERS -->|"types"| relayer
    SIGNERS -->|"BatchTransferData"| contracts
```

**Dependency direction is acyclic.** `abi/` is fully standalone (pure data). `events/` is mostly standalone. `worker/` sits at the bottom of the crypto stack. `token/` is the orchestrator that connects all layers.

---

## React SDK Module Map

```mermaid
graph TD
    subgraph react-sdk["@zama-fhe/react-sdk"]
        ZP[ZamaProvider] --> CTX[ZamaContext]

        subgraph queries["Query Hooks"]
            UCB[useConfidentialBalance]
            UCBS[useConfidentialBalances]
            UTM[useTokenMetadata]
            UTS[useTotalSupply]
            UIC[useIsConfidential]
        end

        subgraph mutations["Mutation Hooks"]
            US[useShield]
            USE[useShieldETH]
            UCT[useConfidentialTransfer]
            UU[useUnshield]
            UUA[useUnshieldAll]
            UCA[useConfidentialApprove]
        end

        subgraph adapters["Signer Sub-paths"]
            VIEM["/viem"]
            ETHERS["/ethers"]
            WAGMI["/wagmi"]
        end
    end

    SDK["@zama-fhe/sdk<br/>ZamaSDK · Token · ReadonlyToken"]

    ZP -->|"initializes"| SDK
    queries -->|"ReadonlyToken"| SDK
    mutations -->|"Token"| SDK
    adapters -->|"GenericSigner"| SDK
```

`ZamaProvider` creates and holds the `ZamaSDK` instance. Query hooks call `ReadonlyToken` methods. Mutation hooks call `Token` methods. Each signer sub-path (`/viem`, `/ethers`, `/wagmi`) re-exports hooks pre-bound to the appropriate signer adapter.

---

## Key Design Patterns

| Pattern                | Where                                   | Why                                                                               |
| ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| **Factory**            | `ZamaSDK` → `Token`/`ReadonlyToken`     | Centralizes construction, injects relayer + signer + storage consistently         |
| **Adapter**            | `GenericSigner`, `GenericStringStorage` | Swappable wallet libraries and storage backends without changing core logic       |
| **Worker Pool**        | `RelayerNodePool`                       | Distributes CPU-intensive FHE operations across Node.js worker threads            |
| **Promise Lock**       | `RelayerWeb.#ensureLock`                | Serializes concurrent operations during worker init and chain switching           |
| **Observer**           | `ZamaSDKEvents`                         | Streams lifecycle events for observability without coupling to specific telemetry |
| **Cache + Encryption** | `CredentialsManager`                    | AES-GCM encrypts private keys at rest; session cache avoids re-derivation         |
