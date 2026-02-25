# Core SDK Overview

A TypeScript SDK for building privacy-preserving token applications using Fully Homomorphic Encryption (FHE). It abstracts the complexity of encrypted ERC-20 operations — shielding, unshielding, confidential transfers, and balance decryption — behind a clean, high-level API. Works with any Web3 library (viem, ethers, or custom signers).

## Installation

```bash
pnpm add @zama-fhe/sdk
```

### Peer dependencies

| Package                 | Version | Required?                                          |
| ----------------------- | ------- | -------------------------------------------------- |
| `viem`                  | >= 2    | Optional — for the `@zama-fhe/sdk/viem` adapter    |
| `ethers`                | >= 6    | Optional — for the `@zama-fhe/sdk/ethers` adapter  |
| `@zama-fhe/relayer-sdk` | >= 0.4  | Optional — only for `@zama-fhe/sdk/node` (Node.js) |

## Entry Points

The package exposes four entry points for tree-shaking:

| Import Path            | Contents                                                                    |
| ---------------------- | --------------------------------------------------------------------------- |
| `@zama-fhe/sdk`        | Core SDK, RelayerWeb, storage, ABIs, event decoders, contract call builders |
| `@zama-fhe/sdk/viem`   | `ViemSigner` adapter + viem read/write contract helpers                     |
| `@zama-fhe/sdk/ethers` | `EthersSigner` adapter + ethers read/write contract helpers                 |
| `@zama-fhe/sdk/node`   | `RelayerNode`, `NodeWorkerClient`, `NodeWorkerPool`, network presets        |

## Architecture

```
ZamaSDK (factory)
  ├── Token (extends ReadonlyToken)
  │     ├── Contract call builders (pure functions returning ContractCallConfig)
  │     ├── CredentialsManager — AES-GCM encrypted FHE credential storage
  │     └── RelayerSDK interface — FHE encrypt/decrypt operations
  └── ReadonlyToken
        ├── Balance queries, batch operations, ERC-165 checks
        └── Static methods: authorizeAll, batchDecryptBalances
```

### Key Abstractions

- **`GenericSigner`** — Framework-agnostic wallet interface (6 methods). Implemented by `ViemSigner`, `EthersSigner`, and `WagmiSigner` (in react-sdk).
- **`RelayerSDK`** — FHE operations interface. `RelayerWeb` uses a Web Worker + WASM CDN bundle. `RelayerNode` calls `@zama-fhe/relayer-sdk/node` directly.
- **`GenericStringStorage`** — Pluggable key-value store for persisted FHE credentials. `MemoryStorage` for tests, `IndexedDBStorage` for browser.
- **Contract call builders** — Pure functions returning `ContractCallConfig` objects. All builders validate address arguments at runtime via `assertAddress()`. The viem/ethers sub-paths wrap these with library-specific execution.

## Supported Networks

| Network          | Chain ID | Preset Config   |
| ---------------- | -------- | --------------- |
| Ethereum Mainnet | 1        | `MainnetConfig` |
| Sepolia Testnet  | 11155111 | `SepoliaConfig` |
| Local Hardhat    | 31337    | `HardhatConfig` |

Defaults for known chains are merged automatically — you only need to supply `relayerUrl` and `network` (RPC URL).

## Choose Your Stack

| Stack                 | SDK             | Provider       | Signer                         |
| --------------------- | --------------- | -------------- | ------------------------------ |
| React + wagmi         | `react-sdk`     | `ZamaProvider` | `WagmiSigner`                  |
| React + viem          | `react-sdk`     | `ZamaProvider` | `ViemSigner`                   |
| React + ethers        | `react-sdk`     | `ZamaProvider` | `EthersSigner`                 |
| React + custom signer | `react-sdk`     | `ZamaProvider` | Implement `GenericSigner`      |
| Vanilla TS + viem     | `sdk`           | N/A            | `ViemSigner`                   |
| Vanilla TS + ethers   | `sdk`           | N/A            | `EthersSigner`                 |
| Node.js backend       | `sdk` + `/node` | N/A            | `ViemSigner` or `EthersSigner` |

## Next Steps

- [Configuration](configuration.md) — relayer, storage, authentication, and network setup
- [Token Operations](token-operations.md) — shield, transfer, unshield, balance decryption
- [Error Handling](error-handling.md) — error classes and pattern matching
- [Contract Call Builders](contract-builders.md) — low-level contract interaction
- [API Reference](../../api/sdk/src/README.md) — full generated API docs
