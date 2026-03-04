# Repository Structure

> Zama Confidential Token SDK -- TypeScript/React SDK for confidential ERC-20 operations using Fully Homomorphic Encryption (FHE) on Ethereum (fhEVM).

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Monorepo Layout](#monorepo-layout)
- [Package: `@zama-fhe/sdk`](#package-zama-fhesdk)
  - [Core Classes](#core-classes)
  - [Relayer Layer](#relayer-layer)
  - [Worker Layer](#worker-layer)
  - [Signer Adapters](#signer-adapters)
  - [Contract Call Builders](#contract-call-builders)
  - [Events System](#events-system)
  - [Credential Management](#credential-management)
  - [Storage Backends](#storage-backends)
  - [Error Hierarchy](#error-hierarchy)
  - [Activity Feed](#activity-feed)
  - [Export Map](#sdk-export-map)
- [Package: `@zama-fhe/react-sdk`](#package-zama-fhereact-sdk)
  - [Provider](#provider)
  - [High-Level Token Hooks](#high-level-token-hooks)
  - [Relayer Hooks](#relayer-hooks)
  - [Adapter Hooks (viem/ethers/wagmi)](#adapter-hooks)
  - [Query Key Factories](#query-key-factories)
  - [Export Map](#react-sdk-export-map)
- [Package: `@zama-fhe/test-app`](#package-zama-fhetest-app)
- [Test Setup](#test-setup)
- [Build System](#build-system)
- [Key Dependencies](#key-dependencies)
- [Domain Glossary](#domain-glossary)

---

## High-Level Architecture

```
                          React Application
                                |
                    @zama-fhe/react-sdk
                   (TanStack Query hooks + ZamaProvider)
                                |
                       @zama-fhe/sdk
                 (Token, ReadonlyToken, ZamaSDK)
                     /         |         \
              ViemSigner  EthersSigner  WagmiSigner
                     \         |         /
                    GenericSigner interface
                                |
                 RelayerSDK interface
                   /                  \
          RelayerWeb (browser)    RelayerNode (Node.js)
               |                        |
       Web Worker (WASM CDN)     worker_threads pool
               |                        |
          @zama-fhe/relayer-sdk (FHE operations)
```

The SDK follows a layered architecture:

1. **Signer adapters** abstract wallet interactions (viem, ethers, wagmi) behind `GenericSigner`.
2. **Relayer backends** abstract FHE encryption/decryption behind `RelayerSDK`, offloading WASM to workers.
3. **Token classes** (`Token`, `ReadonlyToken`) compose signer + relayer into an ERC-20-like API that hides all FHE complexity.
4. **React hooks** wrap token operations in TanStack Query for declarative data fetching with caching, optimistic updates, and cache invalidation.

---

## Monorepo Layout

```
/
  package.json              # Root workspace -- pnpm monorepo
  pnpm-workspace.yaml       # Workspaces: packages/*, tools/*
  tsconfig.json              # Shared TS config with path aliases
  vitest.config.ts           # Global vitest config (jsdom, aliases)
  vitest.setup.ts            # Test setup (jest-dom, fake-indexeddb)
  eslint.config.mjs          # ESLint config (typescript-eslint, prettier)
  api-extractor.base.json    # Shared API report config
  typedoc.json               # TypeDoc documentation config
  hardhat/                   # Git submodule -> zama-ai/zaiffer-smart-contracts
  examples/                  # Usage examples per framework
    node-ethers/
    node-viem/
    react-ethers/
    react-viem/
    react-wagmi/
  docs/                      # Documentation (mdbook/gitbook)
  tools/
    mdbook/                  # Documentation tooling
  packages/
    sdk/                     # @zama-fhe/sdk -- core TypeScript SDK
    react-sdk/               # @zama-fhe/react-sdk -- React hooks layer
    test-app/                # @zama-fhe/test-app -- Next.js E2E test app
```

**Package manager:** pnpm 10+ (with `pnpm-workspace.yaml`).
**Node requirement:** Node.js 22+.
**Build order:** `sdk` must build before `react-sdk` (the root `build` script enforces this).

---

## Package: `@zama-fhe/sdk`

**Path:** `packages/sdk/`
**Description:** Framework-agnostic TypeScript SDK for confidential ERC-20 token operations. Zero React dependency.

### Core Classes

#### `ZamaSDK` (`src/token/zama-sdk.ts`)

Top-level facade that composes a `RelayerSDK`, `GenericSigner`, and `GenericStringStorage` into a convenient factory:

- `createToken(address, wrapper?)` -- returns a `Token` instance for read+write operations.
- `createReadonlyToken(address)` -- returns a `ReadonlyToken` instance for read-only operations.
- `terminate()` -- shuts down the relayer backend.

```ts
interface ZamaSDKConfig {
  relayer: RelayerSDK; // FHE backend (RelayerWeb or RelayerNode)
  signer: GenericSigner; // Wallet adapter (ViemSigner, EthersSigner, etc.)
  storage: GenericStringStorage; // Credential store (IndexedDBStorage, MemoryStorage, etc.)
  credentialDurationDays?: number; // Default: 1 day
  onEvent?: ZamaSDKEventListener; // Structured telemetry callback
}
```

#### `ReadonlyToken` (`src/token/readonly-token.ts`)

Read-only interface for a single confidential token. Supports:

- `balanceOf(owner?)` -- decrypt and return plaintext balance.
- `confidentialBalanceOf(owner?)` -- return raw encrypted handle (no decryption).
- `decryptBalance(handle, owner?)` -- decrypt a single handle.
- `decryptHandles(handles, owner?)` -- batch-decrypt multiple handles in one relayer call.
- `isConfidential()` / `isWrapper()` -- ERC-165 interface checks.
- `discoverWrapper(coordinatorAddress)` -- look up the wrapper via the deployment coordinator.
- `underlyingToken()` / `allowance()` / `name()` / `symbol()` / `decimals()` -- standard ERC-20 reads.
- `authorize()` -- pre-generate FHE credentials to avoid mid-flow wallet prompts.
- `static authorizeAll(tokens)` -- batch-authorize multiple tokens with a single wallet signature.
- `static batchDecryptBalances(tokens, options?)` -- decrypt balances for multiple tokens concurrently.

Internally manages FHE credentials via `CredentialsManager`, which handles keypair generation, EIP-712 signing, session scoping, and AES-GCM encrypted storage.

#### `Token` (`src/token/token.ts`)

Extends `ReadonlyToken` with write operations:

- `confidentialTransfer(to, amount)` -- encrypt amount via FHE, then call the contract.
- `confidentialTransferFrom(from, to, amount)` -- operator transfer (delegated).
- `approve(spender, until?)` -- set operator approval on the confidential token.
- `isApproved(spender)` -- check operator approval.
- `shield(amount, options?)` -- wrap public ERC-20 tokens into confidential tokens (handles ERC-20 approval automatically with configurable strategy: `"exact"`, `"max"`, `"skip"`).
- `shieldETH(amount, value?)` -- wrap native ETH into confidential tokens.
- `unwrap(amount)` -- request unwrap for a specific amount (encrypts amount first).
- `unwrapAll()` -- request unwrap for entire balance (uses on-chain handle directly).
- `unshield(amount, callbacks?)` -- orchestrates: unwrap -> wait for receipt -> parse event -> finalize (single call).
- `unshieldAll(callbacks?)` -- same as `unshield` but for the entire balance.
- `resumeUnshield(unwrapTxHash, callbacks?)` -- resume an interrupted unshield from a saved tx hash.
- `finalizeUnwrap(burnAmountHandle)` -- complete an unwrap with public decryption proof.
- `approveUnderlying(amount?)` -- approve the wrapper to spend the underlying ERC-20.

All write methods return `TransactionResult` (tx hash + receipt) and emit structured events.

### Relayer Layer

#### `RelayerSDK` interface (`src/relayer/relayer-sdk.ts`)

Defines the FHE operations contract implemented by both browser and Node.js backends:

- `generateKeypair()` -- generate FHE keypair.
- `createEIP712(...)` -- create EIP-712 typed data for decrypt authorization.
- `encrypt(params)` -- encrypt plaintext values into FHE ciphertexts.
- `userDecrypt(params)` -- decrypt using user's private key + signature.
- `publicDecrypt(handles)` -- decrypt using network public key (no credentials needed).
- `createDelegatedUserDecryptEIP712(...)` / `delegatedUserDecrypt(...)` -- delegated decryption flow.
- `requestZKProofVerification(zkProof)` -- submit ZK proof for verification.
- `getPublicKey()` / `getPublicParams(bits)` -- fetch FHE network parameters.
- `terminate()` -- clean up resources.

#### `RelayerWeb` (`src/relayer/relayer-web.ts`)

Browser implementation. Loads the `@zama-fhe/relayer-sdk` WASM bundle from a CDN (`cdn.zama.org`) into a **Web Worker** for non-blocking FHE operations. Features:

- Lazy initialization with promise locking (prevents concurrent init races).
- Automatic chain switching (tears down and re-initializes the worker when chain ID changes).
- CSRF token refresh before authenticated requests.
- SHA-384 integrity verification of the CDN bundle.
- Retry with exponential backoff for transient network errors.

#### `RelayerNode` (`src/relayer/relayer-node.ts`)

Node.js implementation. Uses a **worker_threads pool** (`NodeWorkerPool`) for CPU-intensive WASM/FHE operations. Same promise lock pattern as `RelayerWeb` for init and chain switching.

Exported from `@zama-fhe/sdk/node`.

#### `relayer-utils.ts`

Shared utilities:

- `withRetry(fn, retries)` -- exponential backoff retry for transient errors (timeout, network, 502/503/504).
- `mergeFhevmConfig(chainId, overrides)` -- merge user config over SDK defaults.
- `buildEIP712DomainType(domain)` -- construct EIP-712 domain type array.
- Network presets: `MainnetConfig` (chain 1), `SepoliaConfig` (chain 11155111), `HardhatConfig` (chain 31337).

### Worker Layer

Located in `src/worker/`. Abstracts the Web Worker (browser) and `worker_threads` (Node.js) communication.

#### `BaseWorkerClient<TWorker, TConfig>` (`worker.base-client.ts`)

Abstract base class encapsulating:

- Pending request tracking with timeouts (default 30s, init 60s).
- Promise-based request/response matching via unique request IDs.
- Init deduplication (only one init call runs concurrently).
- Domain methods: `generateKeypair()`, `createEIP712()`, `encrypt()`, `userDecrypt()`, `publicDecrypt()`, etc.
- Structured logging via optional `GenericLogger`.

Subclasses implement platform-specific hooks: `createWorker()`, `wireEvents()`, `postMessage()`, `terminateWorker()`, `generateRequestId()`, `getInitPayload()`.

#### `RelayerWorkerClient` (`worker.client.ts`)

Browser-specific subclass. Creates a `new Worker(...)` pointing to `relayer-sdk.worker.js`. Adds `updateCsrf()` for token refresh.

#### `NodeWorkerClient` (`worker.node-client.ts`)

Node.js-specific subclass. Creates a `worker_threads.Worker` pointing to `relayer-sdk.node-worker.js`.

#### `NodeWorkerPool` (`worker.node-pool.ts`)

Pool of `NodeWorkerClient` instances for concurrent operations. Round-robin request distribution.

#### Worker scripts

- `relayer-sdk.worker.ts` -- Web Worker entry point. Loads WASM from CDN, handles all FHE operations.
- `relayer-sdk.node-worker.ts` -- Node.js worker_threads entry point. Imports `@zama-fhe/relayer-sdk/node` directly.

### Signer Adapters

The `GenericSigner` interface (`src/token/token.types.ts`) is the wallet abstraction. Three adapters are provided:

| Adapter        | Path                                       | Import Path                 | Backed By                            |
| -------------- | ------------------------------------------ | --------------------------- | ------------------------------------ |
| `ViemSigner`   | `src/viem/viem-signer.ts`                  | `@zama-fhe/sdk/viem`        | viem `WalletClient` + `PublicClient` |
| `EthersSigner` | `src/ethers/ethers-signer.ts`              | `@zama-fhe/sdk/ethers`      | ethers `BrowserProvider` or `Signer` |
| `WagmiSigner`  | (in react-sdk) `src/wagmi/wagmi-signer.ts` | `@zama-fhe/react-sdk/wagmi` | wagmi `Config`                       |

```ts
interface GenericSigner {
  getChainId(): Promise<number>;
  getAddress(): Promise<Address>;
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  writeContract<C extends ContractCallConfig>(config: C): Promise<Hex>;
  readContract<T>(config: ContractCallConfig): Promise<T>;
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
}
```

Each adapter also exports framework-specific contract read/write helpers (e.g., `readConfidentialBalanceOfContract` for viem, `writeConfidentialTransferContract` for viem/ethers).

### Contract Call Builders

Located in `src/contracts/`. Pure functions that return `ContractCallConfig` objects (address + ABI + function name + args). Organized by contract type:

| Module                      | Contract            | Functions                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encryption.ts`             | Confidential ERC-20 | `confidentialBalanceOfContract`, `confidentialTransferContract`, `confidentialTransferFromContract`, `isOperatorContract`, `setOperatorContract`, `unwrapContract`, `unwrapFromBalanceContract`, `confidentialTotalSupplyContract`, `totalSupplyContract`, `rateContract`, `deploymentCoordinatorContract`, `isFinalizeUnwrapOperatorContract`, `setFinalizeUnwrapOperatorContract` |
| `wrapper.ts`                | Wrapper             | `finalizeUnwrapContract`, `underlyingContract`, `wrapContract`, `wrapETHContract`                                                                                                                                                                                                                                                                                                   |
| `erc20.ts`                  | Standard ERC-20     | `nameContract`, `symbolContract`, `decimalsContract`, `balanceOfContract`, `allowanceContract`, `approveContract`                                                                                                                                                                                                                                                                   |
| `deployment-coordinator.ts` | Coordinator         | `getWrapperContract`, `wrapperExistsContract`                                                                                                                                                                                                                                                                                                                                       |
| `erc165.ts`                 | ERC-165             | `supportsInterfaceContract`, `isConfidentialTokenContract`, `isConfidentialWrapperContract`                                                                                                                                                                                                                                                                                         |
| `fee-manager.ts`            | Fee Manager         | `getWrapFeeContract`, `getUnwrapFeeContract`, `getBatchTransferFeeContract`, `getFeeRecipientContract`                                                                                                                                                                                                                                                                              |
| `transfer-batcher.ts`       | Batch Transfer      | `confidentialBatchTransferContract`                                                                                                                                                                                                                                                                                                                                                 |

ABI definitions live in `src/abi/` as typed const arrays.

ERC-165 interface IDs:

- `ERC7984_INTERFACE_ID` -- confidential token interface.
- `ERC7984_WRAPPER_INTERFACE_ID` -- confidential wrapper interface.

### Events System

#### SDK Events (`src/events/sdk-events.ts`)

Structured telemetry events emitted by Token/ReadonlyToken operations. Never contain sensitive data (no amounts, private keys, handles, or proofs). All events carry `timestamp` and optional `tokenAddress`.

Event categories:

- **Credentials lifecycle:** `credentials:loading`, `credentials:cached`, `credentials:expired`, `credentials:creating`, `credentials:created`, `credentials:locked`, `credentials:unlocked`
- **FHE operations:** `encrypt:start/end/error`, `decrypt:start/end/error`
- **Write operations:** `shield:submitted`, `transfer:submitted`, `transferFrom:submitted`, `approve:submitted`, `approveUnderlying:submitted`, `unwrap:submitted`, `finalizeUnwrap:submitted`, `transaction:error`
- **Unshield orchestration:** `unshield:phase1_submitted`, `unshield:phase2_started`, `unshield:phase2_submitted`

#### On-Chain Events (`src/events/onchain-events.ts`)

Decode raw EVM logs into typed event objects:

- `ConfidentialTransfer` -- encrypted transfer between addresses.
- `Wrapped` -- ERC-20 wrapped into confidential tokens.
- `UnwrapRequested` -- unwrap request submitted.
- `UnwrappedStarted` -- unwrap processing started.
- `UnwrappedFinalized` -- unwrap completed with clear amounts.

### Credential Management

`CredentialsManager` (`src/token/credential-manager.ts`) handles the full FHE credential lifecycle:

1. **Generation:** Generates FHE keypair via relayer, creates EIP-712 typed data, prompts wallet signature.
2. **Session scoping:** Signatures are held in an in-memory `Map` (session-scoped), not persisted to storage. On page reload, the user must re-sign (but does not need to regenerate the keypair).
3. **Persistence:** The FHE private key is encrypted with AES-GCM (key derived from wallet signature via PBKDF2 with 600K iterations) before writing to storage. Only encrypted credentials are persisted.
4. **Re-sign flow:** When stored credentials exist but no session signature is available, prompts the wallet to re-sign the same EIP-712 data.
5. **Legacy migration:** Automatically migrates old format (signature stored alongside encrypted key) to new format (signature only in session).
6. **Lock/Unlock API:** `lock()` clears all session signatures; `unlock(addresses?)` prompts wallet to sign and caches the signature. `isUnlocked()` checks session state.
7. **Validity:** Credentials expire after `durationDays` (default 1 day). Coverage is checked against required contract addresses.

### Storage Backends

All implement `GenericStringStorage`:

| Implementation         | Path                               | Use Case                                                  |
| ---------------------- | ---------------------------------- | --------------------------------------------------------- |
| `IndexedDBStorage`     | `src/token/indexeddb-storage.ts`   | Browser production -- persistent across sessions          |
| `MemoryStorage`        | `src/token/memory-storage.ts`      | Tests and transient use -- in-memory Map                  |
| `AsyncLocalMapStorage` | `src/token/async-local-storage.ts` | Node.js servers -- request-scoped via `AsyncLocalStorage` |

```ts
interface GenericStringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

### Error Hierarchy

All errors extend `ZamaError` which carries a `ZamaErrorCode`:

```
ZamaError (base)
  SigningRejectedError      -- SIGNING_REJECTED (user rejected wallet prompt)
  SigningFailedError         -- SIGNING_FAILED
  EncryptionFailedError      -- ENCRYPTION_FAILED
  DecryptionFailedError      -- DECRYPTION_FAILED
  ApprovalFailedError        -- APPROVAL_FAILED
  TransactionRevertedError   -- TRANSACTION_REVERTED
  CredentialExpiredError     -- CREDENTIAL_EXPIRED
  InvalidCredentialsError    -- INVALID_CREDENTIALS
  NoCiphertextError          -- NO_CIPHERTEXT (never shielded)
  RelayerRequestFailedError  -- RELAYER_REQUEST_FAILED (carries statusCode)
```

`matchZamaError(error, handlers)` provides exhaustive pattern matching on error codes with a wildcard fallback.

### Activity Feed

`src/activity.ts` provides pure functions (no framework dependency) for building a renderable activity feed from raw event logs:

- `parseActivityFeed(logs, userAddress)` -- decode and classify logs into `ActivityItem[]`.
- `extractEncryptedHandles(items)` -- collect unique non-zero encrypted handles needing decryption.
- `applyDecryptedValues(items, decryptedMap)` -- attach decrypted values to encrypted activity items.
- `sortByBlockNumber(items)` -- sort most-recent-first.

Each `ActivityItem` contains:

- `type`: `"transfer"` | `"shield"` | `"unshield_requested"` | `"unshield_started"` | `"unshield_finalized"`
- `direction`: `"incoming"` | `"outgoing"` | `"self"` (relative to user)
- `amount`: clear value or encrypted handle (with optional decrypted value)
- `metadata`: tx hash, block number, log index

### Pending Unshield Persistence

`src/token/pending-unshield.ts` provides `savePendingUnshield()`, `loadPendingUnshield()`, `clearPendingUnshield()` for persisting unwrap tx hashes across page reloads, enabling `resumeUnshield()`.

### SDK Export Map

| Import Path            | Contents                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `@zama-fhe/sdk`        | Core classes, types, ABIs, contract builders, events, errors, activity feed, network configs |
| `@zama-fhe/sdk/viem`   | `ViemSigner`, viem-native contract read/write helpers                                        |
| `@zama-fhe/sdk/ethers` | `EthersSigner`, ethers-native contract helpers                                               |
| `@zama-fhe/sdk/node`   | `RelayerNode`, `NodeWorkerClient`, `NodeWorkerPool`, `asyncLocalStorage`, network configs    |

---

## Package: `@zama-fhe/react-sdk`

**Path:** `packages/react-sdk/`
**Description:** React hooks built on TanStack Query. Re-exports all `@zama-fhe/sdk` symbols.

### Provider

#### `ZamaProvider` (`src/provider.tsx`)

React context provider that wraps a `ZamaSDK` instance. Terminates the relayer on unmount.

```tsx
<ZamaProvider relayer={relayer} signer={signer} storage={storage}>
  <App />
</ZamaProvider>
```

#### `useZamaSDK()`

Hook to access the `ZamaSDK` instance from context. Throws if used outside `ZamaProvider`.

### High-Level Token Hooks

These hooks require `ZamaProvider` in the component tree. They use TanStack Query for caching, invalidation, and optimistic updates.

#### Query Hooks (read operations)

| Hook                                                                          | Description                                 | Pattern                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| `useConfidentialBalance`                                                      | Single-token balance with two-phase polling | `useQuery` x2 (handle poll + decrypt)        |
| `useConfidentialBalances`                                                     | Multi-token batch balance                   | `useQuery` x2 (handles poll + batch decrypt) |
| `useConfidentialIsApproved`                                                   | Check operator approval                     | `useQuery` + suspense variant                |
| `useUnderlyingAllowance`                                                      | ERC-20 allowance check                      | `useQuery` + suspense variant                |
| `useWrapperDiscovery`                                                         | Discover wrapper contract                   | `useQuery` + suspense variant                |
| `useTokenMetadata`                                                            | Token name/symbol/decimals                  | `useQuery` + suspense variant                |
| `useIsConfidential` / `useIsWrapper`                                          | ERC-165 checks                              | `useQuery` + suspense variants               |
| `useTotalSupply`                                                              | Total supply (plain + confidential)         | `useQuery` + suspense variant                |
| `useActivityFeed`                                                             | Parse + decrypt activity feed from raw logs | `useQuery`                                   |
| `useShieldFee` / `useUnshieldFee` / `useBatchTransferFee` / `useFeeRecipient` | Fee queries                                 | `useQuery`                                   |
| `useUserDecryptedValue` / `useUserDecryptedValues`                            | Cached decrypted value lookups              | `useQuery`                                   |

**Two-phase polling pattern** (used by `useConfidentialBalance` and `useConfidentialBalances`):

1. **Phase 1:** Poll the encrypted handle cheaply (RPC read, no wallet interaction). Default interval: 10 seconds.
2. **Phase 2:** Decrypt only when the handle changes (expensive relayer roundtrip). Uses `staleTime: Infinity` so decryption only happens once per handle value.

#### Mutation Hooks (write operations)

| Hook                          | Description                                  | Cache Invalidation                                                                   |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `useShield`                   | Shield ERC-20 into confidential              | Invalidates handle + balance + wagmi balance caches. Supports optimistic updates.    |
| `useShieldETH`                | Shield native ETH                            | Same as shield                                                                       |
| `useConfidentialTransfer`     | Encrypted transfer                           | Invalidates handle + balance caches. Supports optimistic updates (subtracts amount). |
| `useConfidentialTransferFrom` | Operator transfer                            | Invalidates handle + balance caches                                                  |
| `useConfidentialApprove`      | Set operator approval                        | Invalidates approval cache                                                           |
| `useUnshield`                 | Unshield specific amount (unwrap + finalize) | Invalidates handle + balance + allowance + wagmi balance caches                      |
| `useUnshieldAll`              | Unshield entire balance                      | Same as unshield                                                                     |
| `useResumeUnshield`           | Resume interrupted unshield                  | Same as unshield                                                                     |
| `useUnwrap` / `useUnwrapAll`  | Raw unwrap (no finalize)                     | Invalidates handle + balance caches                                                  |
| `useFinalizeUnwrap`           | Complete unwrap with proof                   | Invalidates handle + balance + wagmi balance caches                                  |
| `useApproveUnderlying`        | Approve wrapper to spend ERC-20              | Invalidates allowance cache                                                          |
| `useAuthorizeAll`             | Batch-authorize FHE credentials              | No cache invalidation                                                                |

**Mutation options factories:** Each mutation hook also exports a standalone `*MutationOptions(token)` function for use outside React (e.g., with `useMutation` directly).

**Optimistic updates:** `useShield` and `useConfidentialTransfer` support `optimistic: true` which immediately updates the cached balance, rolling back on error via cache invalidation.

### Relayer Hooks

Low-level hooks wrapping individual `RelayerSDK` methods:

| Hook                                  | Description                              |
| ------------------------------------- | ---------------------------------------- |
| `useEncrypt`                          | Encrypt values for contract calls        |
| `useUserDecrypt`                      | Decrypt with user credentials            |
| `usePublicDecrypt`                    | Decrypt with network public key          |
| `useGenerateKeypair`                  | Generate FHE keypair                     |
| `useCreateEIP712`                     | Create EIP-712 for decrypt authorization |
| `useCreateDelegatedUserDecryptEIP712` | Create delegated decrypt EIP-712         |
| `useDelegatedUserDecrypt`             | Delegated decryption                     |
| `useRequestZKProofVerification`       | Submit ZK proof for verification         |
| `usePublicKey`                        | Query the FHE network public key         |
| `usePublicParams`                     | Query FHE public parameters              |

### Adapter Hooks

Three adapter subpaths provide framework-specific hooks that **do not require `ZamaProvider`**. They operate directly through their respective framework's connection/config.

#### `@zama-fhe/react-sdk/wagmi` (`src/wagmi/index.ts`)

Uses wagmi's `useWriteContract`, `useReadContract`, `useSuspenseReadContract`:

- `useShield` / `useShieldETH` -- raw contract writes via wagmi
- `useConfidentialTransfer` / `useConfidentialBatchTransfer`
- `useUnwrap` / `useUnwrapFromBalance` / `useFinalizeUnwrap`
- `useSetOperator`
- `useConfidentialBalanceOf` (+ suspense) / `useBalanceOf` (+ suspense)
- `useWrapperForToken` (+ suspense) / `useWrapperExists` (+ suspense)
- `useUnderlyingToken` (+ suspense) / `useSupportsInterface` (+ suspense)
- `WagmiSigner` -- `GenericSigner` backed by wagmi Config
- Also re-exports high-level hooks from the main entry point for convenience

#### `@zama-fhe/react-sdk/viem` (`src/viem/index.ts`)

Uses viem `PublicClient`/`WalletClient` directly via TanStack Query:

- Same hook set as wagmi adapter, minus wagmi-specific hooks (no `useBalanceOf`)
- `ViemSigner` -- `GenericSigner` backed by viem clients

#### `@zama-fhe/react-sdk/ethers` (`src/ethers/index.ts`)

Uses ethers `Provider`/`Signer` via TanStack Query:

- Same hook set as viem adapter
- `EthersSigner` -- `GenericSigner` backed by ethers Signer/BrowserProvider

### Query Key Factories

Exported for external cache management:

| Factory                                          | Keys                                          |
| ------------------------------------------------ | --------------------------------------------- |
| `confidentialBalanceQueryKeys`                   | `.all`, `.token(addr)`, `.owner(addr, owner)` |
| `confidentialBalancesQueryKeys`                  | `.all`, `.tokens(addrs, owner)`               |
| `confidentialHandleQueryKeys`                    | `.all`, `.token(addr)`, `.owner(addr, owner)` |
| `confidentialHandlesQueryKeys`                   | `.all`, `.tokens(addrs, owner)`               |
| `publicKeyQueryKeys`                             | Public key cache                              |
| `publicParamsQueryKeys`                          | Public params cache                           |
| `underlyingAllowanceQueryKeys`                   | ERC-20 allowance cache                        |
| `wrapperDiscoveryQueryKeys`                      | Wrapper discovery cache                       |
| `tokenMetadataQueryKeys`                         | Token metadata cache                          |
| `activityFeedQueryKeys`                          | Activity feed cache                           |
| `isConfidentialQueryKeys` / `isWrapperQueryKeys` | ERC-165 check cache                           |
| `totalSupplyQueryKeys`                           | Total supply cache                            |
| `feeQueryKeys`                                   | Fee query cache                               |
| `confidentialIsApprovedQueryKeys`                | Approval check cache                          |
| `decryptionKeys`                                 | Decrypted value cache                         |
| `wagmiBalancePredicates`                         | Predicate matchers for wagmi's balance cache  |

### React SDK Export Map

| Import Path                  | Contents                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `@zama-fhe/react-sdk`        | Provider, all hooks, query keys, mutation options + full re-export of `@zama-fhe/sdk` |
| `@zama-fhe/react-sdk/viem`   | Viem-specific low-level hooks + `ViemSigner` + high-level hook re-exports             |
| `@zama-fhe/react-sdk/ethers` | Ethers-specific low-level hooks + `EthersSigner` + high-level hook re-exports         |
| `@zama-fhe/react-sdk/wagmi`  | Wagmi-specific low-level hooks + `WagmiSigner` + high-level hook re-exports           |

---

## Package: `@zama-fhe/test-app`

**Path:** `packages/test-app/`
**Description:** Next.js 16 (App Router) application for E2E testing. Private package, not published.

- Uses `@zama-fhe/react-sdk` with wagmi connector.
- Pages: `/shield`, `/transfer`, `/unshield`, `/wallet` -- each with form components using `data-testid` attributes.
- **Provider stack:** `QueryClientProvider` > `WagmiProvider` > `ZamaProvider`.
- **Burner connector:** Custom wagmi connector for E2E tests -- reads private key from `localStorage("burnerWallet.pk")`, injected by Playwright.
- **Playwright fixtures:** Mock FHE relayer SDK routes, intercept CDN script requests, snapshot/revert Hardhat state per test.
- Tests run serially (`workers: 1`) because the Hardhat mock coprocessor cannot handle concurrent decrypt operations.
- **Hardhat submodule:** `hardhat/` is a git submodule pointing to `zama-ai/zaiffer-smart-contracts`.

---

## Test Setup

### Unit Tests

- **Framework:** Vitest 4.x with jsdom environment.
- **Location:** `packages/*/src/__tests__/*.test.{ts,tsx}` (co-located in `__tests__` directories).
- **Setup file:** `vitest.setup.ts` -- imports `@testing-library/jest-dom/vitest` and `fake-indexeddb/auto`.
- **React testing:** `@testing-library/react` + `@testing-library/user-event`.
- **Mocking:** Vitest `vi.fn()` for all interfaces. Test utilities in `packages/react-sdk/src/__tests__/test-utils.tsx` provide `createMockSigner()`, `createMockRelayer()`, `createMockStorage()`, and `renderWithProviders()` (wraps components in `QueryClientProvider` + `ZamaProvider` with mocks).
- **Coverage:** v8 provider with 80% threshold for lines, branches, and functions. Covers `packages/sdk/src/**` and `packages/react-sdk/src/**`.
- **Alias resolution:** Vitest config maps `@zama-fhe/sdk` and `@zama-fhe/react-sdk` to source directories for tests to run against unbuilt source.

### E2E Tests

- **Framework:** Playwright.
- **Location:** `packages/test-app/playwright/`.
- **Setup:** Playwright auto-starts Hardhat node (port 8545) and Next.js dev server (port 3100) via `webServer` config.
- **Isolation:** Each test snapshots Hardhat state before and reverts after.
- **FHE mocking:** Route interception replaces relayer SDK HTTP calls with `@fhevm/mock-utils` implementations.

### Running Tests

```bash
# Unit tests (all packages)
pnpm test              # Watch mode
pnpm test:run          # Single run
pnpm test:coverage     # With coverage
pnpm test:ui           # Vitest UI

# E2E tests (from root)
pnpm e2e:test          # Headless
pnpm e2e:test:ui       # Playwright UI

# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix
```

---

## Build System

### Package Builds

Both `@zama-fhe/sdk` and `@zama-fhe/react-sdk` use **tsup** (ESM-only output):

**SDK tsup config:**

- Entry points: `index`, `viem/index`, `ethers/index`, `node/index`, `relayer-sdk.worker`, `relayer-sdk.node-worker`
- External: `viem`, `ethers`, `@zama-fhe/relayer-sdk`
- Generates `.d.ts` declarations, source maps, tree-shakeable

**React SDK tsup config:**

- Entry points: `index`, `viem/index`, `ethers/index`, `wagmi/index`
- External: `react`, `react-dom`, `@tanstack/react-query`, `viem`, `ethers`, `wagmi`, `@zama-fhe/sdk`, `@zama-fhe/relayer-sdk`
- Custom plugin: injects `"use client"` directive at the top of all JS output files for RSC compatibility

### Build Commands

```bash
pnpm build           # Build sdk then react-sdk (sequential)
pnpm build:sdk       # Build @zama-fhe/sdk only
pnpm build:react-sdk # Build @zama-fhe/react-sdk only
```

### Other Tooling

- **Changesets:** `@changesets/cli` for versioning and publishing.
- **API Extractor:** `@microsoft/api-extractor` for API surface reports and compatibility checking.
- **TypeDoc:** API documentation generation (markdown output via `typedoc-plugin-markdown`).
- **mdbook:** Documentation site (Gitbook-compatible).
- **Husky + lint-staged:** Pre-commit hooks run ESLint and Prettier on staged files.
- **Prettier:** Code formatting with Solidity plugin support.

---

## Key Dependencies

### Core SDK (`@zama-fhe/sdk`)

| Dependency              | Role                              | Relationship                                        |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| `@zama-fhe/relayer-sdk` | FHE WASM runtime                  | Peer dependency (~0.4.1), loaded via CDN in browser |
| `viem`                  | Ethereum library (viem adapter)   | Optional peer dependency (>=2)                      |
| `ethers`                | Ethereum library (ethers adapter) | Optional peer dependency (>=6)                      |
| `tsup`                  | Build tool                        | Production dependency (for `prepare` script)        |

### React SDK (`@zama-fhe/react-sdk`)

| Dependency              | Role                    | Relationship                   |
| ----------------------- | ----------------------- | ------------------------------ |
| `@zama-fhe/sdk`         | Core SDK                | Peer dependency (workspace:\*) |
| `react`                 | React runtime           | Peer dependency (>=18)         |
| `@tanstack/react-query` | Data fetching + caching | Peer dependency (>=5)          |
| `viem`                  | Viem adapter            | Optional peer dependency (>=2) |
| `ethers`                | Ethers adapter          | Optional peer dependency (>=6) |
| `wagmi`                 | Wagmi adapter           | Optional peer dependency (>=2) |

### Dev Dependencies (root)

| Dependency                          | Role                               |
| ----------------------------------- | ---------------------------------- |
| `vitest` 4.x                        | Test runner                        |
| `@testing-library/react`            | React component testing            |
| `@testing-library/jest-dom`         | DOM assertion matchers             |
| `@testing-library/user-event`       | User interaction simulation        |
| `@faker-js/faker`                   | Test data generation               |
| `@fhevm/mock-utils`                 | FHE mock utilities for testing     |
| `fake-indexeddb`                    | IndexedDB polyfill for jsdom tests |
| `jsdom`                             | Browser environment for tests      |
| `typescript` 5.9.x                  | TypeScript compiler                |
| `eslint` 10.x + `typescript-eslint` | Linting                            |
| `prettier`                          | Code formatting                    |

---

## Domain Glossary

| Term                       | Meaning                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **FHE**                    | Fully Homomorphic Encryption -- allows computation on encrypted data without decrypting    |
| **fhEVM**                  | FHE-enabled Ethereum Virtual Machine (Zama's technology)                                   |
| **Shield**                 | Convert public ERC-20 tokens into confidential (encrypted) tokens by wrapping              |
| **Unshield**               | Convert confidential tokens back to public ERC-20 tokens (unwrap + finalize)               |
| **Unwrap**                 | First phase of unshield -- request decryption of confidential balance                      |
| **Finalize Unwrap**        | Second phase of unshield -- provide decryption proof to release public tokens              |
| **Handle**                 | Opaque 32-byte identifier for an encrypted value stored on-chain                           |
| **Relayer**                | Backend service that performs FHE operations (encryption, decryption, proof generation)    |
| **Credentials**            | FHE keypair + EIP-712 signature authorizing the relayer to decrypt for a user              |
| **Wrapper**                | Smart contract that wraps a standard ERC-20 into a confidential ERC-20                     |
| **Deployment Coordinator** | Registry contract mapping underlying tokens to their wrapper contracts                     |
| **ERC-7984**               | ERC standard for confidential token interfaces (supportsInterface checks)                  |
| **Two-phase polling**      | Pattern: poll encrypted handle cheaply, only decrypt when handle changes                   |
| **Session signature**      | EIP-712 wallet signature held only in memory (not persisted), required per browser session |
