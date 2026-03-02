# Architecture Documentation Design

## Goal

Create `docs/architecture.md` — a single internal-facing document that explains the SDK's architecture layers with D2 and Mermaid diagrams for contributors.

## Audience

Internal team and contributors. Technical, terse prose. No tutorial content.

## Document Structure

### 1. Overview

One paragraph: what the SDK does, key design philosophy (layered abstraction, swappable adapters, FHE complexity hidden behind ERC-20-like API).

### 2. Architecture Layers (D2 diagram)

Vertical stack showing 8 layers with data flow arrows:

- React hooks (`@zama-fhe/react-sdk`)
- React Query integration
- Token abstraction (`ZamaSDK`, `Token`, `ReadonlyToken`)
- Contract call builders
- Signer adapters (`GenericSigner` → Viem/Ethers/Wagmi)
- Relayer layer (`RelayerWeb`/`RelayerNode` — encryption/decryption)
- Worker layer (Web Worker + WASM / Node Worker Pool)
- Storage layer (`CredentialsManager` + storage backends)

Color-coded by concern. Each layer gets 2-3 sentences describing responsibility.

### 3. Core SDK Module Map (D2 diagram)

Internal module structure of `@zama-fhe/sdk`:

- `token/` — ZamaSDK, Token, ReadonlyToken, CredentialsManager, BalanceCache
- `contracts/` — ERC-20, Wrapper, Encryption, Fee, Batcher builders
- `relayer/` — RelayerWeb, RelayerNode, relayer-utils
- `worker/` — Worker client (browser), Node pool
- `events/` — SDK events, on-chain event decoders
- `abi/` — Contract ABIs
- `storage/` — IndexedDB, Memory, AsyncLocalStorage

Shows composition/dependency arrows.

### 4. React SDK Module Map (Mermaid diagram)

How `@zama-fhe/react-sdk` wraps the core:

- `ZamaProvider` → context + React Query setup
- Query hooks (useConfidentialBalance, useTokenMetadata, etc.)
- Mutation hooks (useShield, useConfidentialTransfer, useUnshield, etc.)
- Signer adapter sub-paths (/viem, /ethers, /wagmi)

### 5. Key Design Patterns

Brief list:

- Factory (ZamaSDK creates Token/ReadonlyToken)
- Adapter (GenericSigner, GenericStringStorage)
- Worker Pool (RelayerNodePool for Node.js)
- Promise Lock (RelayerWeb serialization)
- Observer (event system)
- Cache + Encryption (CredentialsManager)

## Diagram Format

- D2 for architecture layers and module maps (richer styling, better for complex diagrams)
- Mermaid for React SDK map (GitHub-renderable, simpler structure)
- D2 source files stored alongside as `.d2` files for regeneration

## File Deliverables

- `docs/architecture.md` — the document
- `docs/diagrams/layers.d2` — layer diagram source
- `docs/diagrams/sdk-modules.d2` — core SDK module map source

## Prose Style

- Terse, technical, contributor-focused
- 2-3 sentences per layer/module
- File paths use `packages/sdk/src/...` format
- No tutorial or getting-started content
