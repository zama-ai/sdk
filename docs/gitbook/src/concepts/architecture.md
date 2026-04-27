# Architecture

## Layer overview

The SDK is organized into layers, each with a clear responsibility. Higher layers depend on lower layers but never the reverse.

![Zama SDK Architecture Layers](../images/layers.svg)

| Layer                          | Responsibility                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **React SDK**                  | `ZamaProvider` context + hooks wrapping `@tanstack/react-query`                                           |
| **Query & Mutation Factories** | Framework-agnostic `queryOptions` / `mutationOptions` consumed by React Query (or directly)               |
| **Contract Abstraction**       | `ZamaSDK`, `Token`, `ReadonlyToken` — the main developer-facing API                                       |
| **Contract Call Builders**     | Pure functions returning `{ address, abi, functionName, args }` for any Web3 library                      |
| **Signer Adapters**            | `ViemSigner`, `EthersSigner`, `WagmiSigner` — unified signing interface                                   |
| **Relayer**                    | `RelayerWeb` (browser WASM), `RelayerNode` (server), `RelayerCleartext` (testing)                         |
| **Worker**                     | Web Worker + WASM in browsers, `worker_threads` pool in Node.js                                           |
| **Storage & Credentials**      | `CredentialsManager` with pluggable backends (IndexedDB, Memory, AsyncLocalStorage, ChromeSessionStorage) |
| **Event System**               | `ZamaSDKEvents` lifecycle events + on-chain event decoders                                                |

## `createConfig` pattern

Each adapter path (`@zama-fhe/sdk/viem`, `@zama-fhe/sdk/ethers`, `@zama-fhe/react-sdk/wagmi`) exports a `createConfig()` function that wires up the provider, signer, and relayer dispatcher from framework-native objects.

## Module map

The core `@zama-fhe/sdk` package is split into focused modules:

![SDK Module Map](../images/sdk-modules.svg)

### Entry points

Each package exposes multiple entry points for tree-shaking:

**`@zama-fhe/sdk`**

| Import Path            | Contents                                                                    |
| ---------------------- | --------------------------------------------------------------------------- |
| `@zama-fhe/sdk`        | Core SDK, RelayerWeb, storage, ABIs, event decoders, contract call builders |
| `@zama-fhe/sdk/viem`   | `ViemSigner` adapter + viem read/write contract helpers                     |
| `@zama-fhe/sdk/ethers` | `EthersSigner` adapter + ethers read/write contract helpers                 |
| `@zama-fhe/sdk/node`   | `RelayerNode`, `NodeWorkerClient`, `NodeWorkerPool`, network presets        |
| `@zama-fhe/sdk/query`  | Query/mutation option factories, query keys, invalidation helpers           |

**`@zama-fhe/react-sdk`**

| Import Path                 | Contents                                             |
| --------------------------- | ---------------------------------------------------- |
| `@zama-fhe/react-sdk`       | Provider-based hooks (`ZamaProvider` + `use*` hooks) |
| `@zama-fhe/react-sdk/wagmi` | `createConfig`, `WagmiSigner` adapter, `WagmiProvider` |
