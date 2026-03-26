# @zama-fhe/sdk

A TypeScript SDK for building privacy-preserving applications on Zama's fhEVM using Fully Homomorphic Encryption (FHE). It abstracts the complexity of confidential contract operations — session management, encrypted state, shielding, unshielding, confidential transfers, and balance decryption — behind a clean, high-level API. Works with any Web3 library (viem, ethers, or custom signers).

## Installation

```bash
pnpm add @zama-fhe/sdk
# or
npm install @zama-fhe/sdk
# or
yarn add @zama-fhe/sdk
```

### Peer dependencies

| Package  | Version | Required?                                         |
| -------- | ------- | ------------------------------------------------- |
| `viem`   | >= 2    | Optional — for the `@zama-fhe/sdk/viem` adapter   |
| `ethers` | >= 6    | Optional — for the `@zama-fhe/sdk/ethers` adapter |

## Module Systems (ESM & CJS)

The SDK ships both ESM and CommonJS builds. Most modern toolchains use ESM automatically — no extra configuration needed. If your project uses CommonJS (`"type": "commonjs"` in `package.json` or `"moduleResolution": "node"` in `tsconfig.json`), the `require` condition is resolved automatically.

### ESM (recommended)

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
```

### CommonJS

```js
const { ZamaSDK, RelayerWeb } = require("@zama-fhe/sdk");
const { EthersSigner } = require("@zama-fhe/sdk/ethers");
```

### Available subpath exports

| Subpath                   | Description                          | CJS |
| ------------------------- | ------------------------------------ | --- |
| `@zama-fhe/sdk`           | Core SDK (ZamaSDK, RelayerWeb, etc.) | Yes |
| `@zama-fhe/sdk/viem`      | Viem adapter (ViemSigner)            | Yes |
| `@zama-fhe/sdk/ethers`    | Ethers adapter (EthersSigner)        | Yes |
| `@zama-fhe/sdk/node`      | Node.js backend (RelayerNode)        | No  |
| `@zama-fhe/sdk/query`     | TanStack Query integration           | Yes |
| `@zama-fhe/sdk/cleartext` | Cleartext testing adapter            | Yes |

> **Note:** The `@zama-fhe/sdk/node` subpath is ESM-only because it relies on `node:worker_threads` which is inherently ESM-oriented.

### TypeScript configuration

The SDK works with all TypeScript `moduleResolution` modes:

- **`"bundler"` / `"node16"` / `"nodenext"`** — resolved via the `exports` field (recommended)
- **`"node"`** — resolved via the `typesVersions` fallback

## Quick Start

### Browser

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { mainnet, sepolia } from "viem/chains";

// 1. Create signer and relayer
const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [mainnet.id]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [sepolia.id]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: new IndexedDBStorage(),
});

// 2. Create a token instance (wrapper is auto-discovered if omitted)
const token = sdk.createToken("0xEncryptedERC20Address");
// Or provide the wrapper explicitly:
// const token = sdk.createToken("0xEncryptedERC20Address", "0xWrapperAddress");

// 3. Shield (wrap) public tokens into confidential tokens
const { txHash } = await token.shield(1000n);

// 4. Check decrypted balance
const balance = await token.balanceOf();
console.log("Confidential balance:", balance);

// 5. Transfer confidential tokens
const transferTx = await token.confidentialTransfer("0xRecipient", 500n);
```

### Node.js

```ts
import { ZamaSDK } from "@zama-fhe/sdk";
import { RelayerNode, asyncLocalStorage } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { mainnet, sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4, // number of worker threads (default: min(CPUs, 4))
    transports: {
      [mainnet.id]: {
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
      },
      [sepolia.id]: {
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
      },
    },
  }),
  signer,
  storage: asyncLocalStorage,
});

const token = sdk.createToken("0xEncryptedERC20Address");
const balance = await token.balanceOf();
```

## Core Concepts

### ZamaSDK

Entry point to the SDK. Composes a relayer backend with a signer and storage layer. Manages sessions, credentials, and acts as a factory for contract instances.

```ts
const sdk = new ZamaSDK({
  relayer, // RelayerSDK — either RelayerWeb (browser) or RelayerNode (Node.js)
  signer, // GenericSigner
  storage, // GenericStorage
});

// Read-only — balances, metadata, decryption. No wrapper needed.
const readonlyToken = sdk.createReadonlyToken("0xTokenAddress");

// Full read/write — shield, unshield, transfer, approve.
// The token address IS the wrapper (encrypted ERC20 = wrapper contract).
const token = sdk.createToken("0xTokenAddress");
// Override wrapper if it differs from the token address (rare):
// const token = sdk.createToken("0xTokenAddress", "0xWrapperAddress");
```

The `relayer`, `signer`, and `storage` properties are public and accessible after construction. Low-level FHE operations (`encrypt`, `userDecrypt`, `publicDecrypt`, `generateKeypair`, etc.) are available via `sdk.relayer`. Call `sdk.terminate()` to clean up resources when done.

### Relayer Backends

The `RelayerSDK` interface defines the FHE operations contract. Two implementations are provided:

| Backend       | Import               | Environment | How it works                               |
| ------------- | -------------------- | ----------- | ------------------------------------------ |
| `RelayerWeb`  | `@zama-fhe/sdk`      | Browser     | Runs WASM in a Web Worker via CDN          |
| `RelayerNode` | `@zama-fhe/sdk/node` | Node.js     | Uses `@zama-fhe/relayer-sdk/node` directly |

The `/node` sub-path also exports `NodeWorkerClient` and `NodeWorkerClientConfig` for running FHE operations in a Node.js worker thread.

You can also implement the `RelayerSDK` interface for custom backends.

### Token

Full read/write interface for a single confidential ERC-20. Extends `ReadonlyToken`. The encrypted ERC-20 contract IS the wrapper, so `wrapper` defaults to the token `address`. Pass an explicit `wrapper` only if they differ.

| Method                                                     | Description                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shield(amount, options?)`                                 | Shield (wrap) public ERC-20 tokens. Handles approval automatically. Options: `{ approvalStrategy: "max" \| "exact" \| "skip" }` (default `"exact"`). `"skip"` bypasses approval (use when already approved). |
| `shieldETH(amount, value?)`                                | Shield (wrap) native ETH. `value` defaults to `amount`. Use this when the underlying token is the zero address (native ETH).                                                                                 |
| `unshield(amount, callbacks?)`                             | Unwrap a specific amount and finalize in one call. Orchestrates: unwrap → wait receipt → parse event → finalizeUnwrap. Optional `UnshieldCallbacks` for progress tracking.                                   |
| `unshieldAll(callbacks?)`                                  | Unwrap the entire balance and finalize in one call. Orchestrates: unwrapAll → wait receipt → parse event → finalizeUnwrap. Optional `UnshieldCallbacks` for progress tracking.                               |
| `unwrap(amount)`                                           | Request unwrap for a specific amount (low-level, requires manual finalization).                                                                                                                              |
| `unwrapAll()`                                              | Request unwrap for the entire balance (low-level, requires manual finalization).                                                                                                                             |
| `resumeUnshield(unwrapTxHash, callbacks?)`                 | Resume an interrupted unshield from an existing unwrap tx hash. Goes straight to wait receipt → finalize.                                                                                                    |
| `finalizeUnwrap(burnAmountHandle)`                         | Complete unwrap with public decryption proof.                                                                                                                                                                |
| `confidentialTransfer(to, amount)`                         | Encrypted transfer. Encrypts amount, then calls the contract.                                                                                                                                                |
| `confidentialTransferFrom(from, to, amt)`                  | Operator encrypted transfer.                                                                                                                                                                                 |
| `approve(spender, until?)`                                 | Set operator approval. `until` defaults to now + 1 hour.                                                                                                                                                     |
| `isApproved(spender)`                                      | Check if a spender is an approved operator.                                                                                                                                                                  |
| `approveUnderlying(amount?)`                               | Approve wrapper to spend underlying ERC-20. Default: max uint256.                                                                                                                                            |
| `delegateDecryption({ delegateAddress, expirationDate? })` | Grant decryption rights to another address via the on-chain ACL. Default: permanent. ACL address resolved from relayer config.                                                                               |
| `revokeDelegation({ delegateAddress })`                    | Revoke decryption delegation for this token. ACL address resolved from relayer config.                                                                                                                       |
| `balanceOf(owner?)`                                        | Decrypt and return the plaintext balance.                                                                                                                                                                    |
| `decryptHandles(handles, owner?)`                          | Batch-decrypt arbitrary encrypted handles.                                                                                                                                                                   |

All write methods return a `TransactionResult` object:

```ts
interface TransactionResult {
  txHash: Hex;
  receipt: TransactionReceipt;
}
```

### ReadonlyToken

Read-only subset. No wrapper address needed.

| Method                                                       | Description                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `balanceOf(owner?)`                                          | Decrypt and return the plaintext balance.                                              |
| `confidentialBalanceOf(owner?)`                              | Return the raw encrypted balance handle (no decryption).                               |
| `decryptBalance(handle, owner?)`                             | Decrypt a single encrypted handle.                                                     |
| `decryptHandles(handles, owner?)`                            | Batch-decrypt handles in a single relayer call.                                        |
| `allow()`                                                    | Ensure FHE decrypt credentials exist (generates/signs if needed).                      |
| `allow(...tokens)` _(static)_                                | Pre-authorize multiple tokens with a single wallet signature.                          |
| `isAllowed()`                                                | Whether a session signature is currently cached for this token.                        |
| `revoke()`                                                   | Clear the session signature for the connected wallet.                                  |
| `credentials.allow(...addresses)`                            | Pre-authorize and cache the session signature for specific token addresses.            |
| `credentials.revoke(...addresses?)`                          | Clear the session signature for the connected wallet.                                  |
| `credentials.isAllowed()`                                    | Whether a session signature is currently cached.                                       |
| `credentials.isExpired(address?)`                            | Whether stored credentials are past their expiration time.                             |
| `credentials.clear()`                                        | Delete stored credentials for the connected wallet.                                    |
| `decryptBalanceAs({ delegatorAddress, owner? })`             | Decrypt a delegator's balance as a delegate. ACL address resolved from relayer config. |
| `isDelegated({ delegatorAddress, delegateAddress })`         | Check if a delegation is active and unexpired.                                         |
| `getDelegationExpiry({ delegatorAddress, delegateAddress })` | Raw expiry timestamp (`0n` = none, `2^64-1` = permanent).                              |
| `isConfidential()`                                           | ERC-165 check for ERC-7984 support.                                                    |
| `isWrapper()`                                                | ERC-165 check for wrapper interface.                                                   |
| `discoverWrapper(coordinatorAddress)`                        | Look up a wrapper for this token via the deployment coordinator.                       |
| `underlyingToken()`                                          | Read the underlying ERC-20 address from a wrapper.                                     |
| `allowance(wrapper, owner?)`                                 | Read ERC-20 allowance of the underlying token.                                         |
| `isZeroHandle(handle)`                                       | Returns `true` if the handle is the zero sentinel.                                     |
| `name()` / `symbol()` / `decimals()`                         | Read token metadata.                                                                   |

Static methods for multi-token operations:

```ts
// Pre-authorize all tokens with a single wallet signature
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));
await ReadonlyToken.allow(...tokens);
// All subsequent decrypts reuse cached credentials — no more wallet prompts

// Decrypt balances for multiple tokens in parallel
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { owner });

// Decrypt pre-fetched handles for multiple tokens
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { handles, owner });
```

Batch delegation (on `Token`):

```ts
const tokens = addresses.map((a) => sdk.createToken(a));

// Delegate across multiple tokens — returns Map<Address, TransactionResult | ZamaError>
const results = await Token.batchDelegateDecryption({
  tokens,
  delegateAddress: "0xDelegate",
});

// Revoke across multiple tokens
const results = await Token.batchRevokeDelegation(tokens, "0xDelegate");
```

### Pending Unshield Persistence

The unshield flow is two-phase: unwrap tx, then finalize. If the page reloads between phases, the unwrap tx hash is lost. Use these utilities to persist it:

```ts
import { savePendingUnshield, loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

// Save the unwrap hash before finalization
await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

// On next load, check for pending unshields
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await token.resumeUnshield(pending);
  await clearPendingUnshield(storage, wrapperAddress);
}
```

### Storage

FHE credentials (encrypted keypair + metadata) are persisted to `storage`. The wallet signature is kept in `sessionStorage` (in-memory by default) — never written to disk. Two storage roles:

**Credential storage** (`storage`) — persists encrypted keypairs:

| Storage             | Use case                                                 |
| ------------------- | -------------------------------------------------------- |
| `indexedDBStorage`  | Browser apps — persists across page reloads and sessions |
| `memoryStorage`     | Tests, scripts, throwaway sessions                       |
| `asyncLocalStorage` | Node.js servers — isolate credentials per request        |
| Custom              | Implement the `GenericStorage` interface                 |

**Session storage** (`sessionStorage`) — holds wallet signatures for the current session:

| Storage                | Use case                                                    |
| ---------------------- | ----------------------------------------------------------- |
| Default (in-memory)    | Standard web apps — signature lost on reload, user re-signs |
| `chromeSessionStorage` | MV3 web extensions — survives service worker restarts       |
| Custom                 | Implement the `GenericStorage` interface                    |

```ts
interface GenericStorage<T = unknown> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}
```

#### Web Extension Example

For MV3 extensions, use the built-in `chromeSessionStorage` singleton to share the wallet signature across popup, background, and content script contexts:

```ts
import { ZamaSDK, indexedDBStorage, chromeSessionStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage, // encrypted keypairs (persistent)
  sessionStorage: chromeSessionStorage, // wallet signatures (ephemeral, shared across contexts)
});
```

## Configuration Reference

### `ZamaSDKConfig`

| Field            | Type                   | Description                                                                                                                            |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `relayer`        | `RelayerSDK`           | Relayer backend (`RelayerWeb` or `RelayerNode` instance)                                                                               |
| `signer`         | `GenericSigner`        | Wallet signer interface.                                                                                                               |
| `storage`        | `GenericStorage`       | Credential storage backend.                                                                                                            |
| `sessionStorage` | `GenericStorage`       | Optional. Session storage for wallet signatures. Default: in-memory (lost on reload). Use `chrome.storage.session` for web extensions. |
| `keypairTTL`     | `number`               | Optional. Seconds the ML-KEM re-encryption keypair remains valid. Default: `86400` (1 day). Must be positive.                          |
| `sessionTTL`     | `number`               | Optional. Seconds the session signature remains valid. Default: `2592000` (30 days). `0` = re-sign every operation.                    |
| `onEvent`        | `ZamaSDKEventListener` | Optional. Structured event listener for debugging.                                                                                     |

#### Structured Event Listener

The `onEvent` callback receives typed events at key lifecycle points. Event payloads never contain sensitive data (amounts, keys, proofs) — only metadata useful for debugging and telemetry.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  onEvent: ({ type, tokenAddress, ...event }) => {
    console.debug(`[Zama] ${type}`, {
      tokenAddress: tokenAddress?.slice(0, 10),
      ...event,
    });
  },
});
```

**Event types:**

| Category               | Events                                                                                                                                                               | Key fields                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Credentials            | `credentials:loading`, `credentials:cached`, `credentials:expired`, `credentials:creating`, `credentials:created`, `credentials:revoked`, `credentials:allowed`      | `contractAddresses`                                              |
| Encryption             | `encrypt:start`, `encrypt:end`, `encrypt:error`                                                                                                                      | `durationMs` (end/error), `error` (error)                        |
| Decryption             | `decrypt:start`, `decrypt:end`, `decrypt:error`                                                                                                                      | `durationMs` (end/error), `error` (error)                        |
| Transactions           | `transaction:error`                                                                                                                                                  | `operation` (`"transfer"`, `"wrap"`, `"approve"`, etc.), `error` |
| Write confirmations    | `wrap:submitted`, `transfer:submitted`, `transferFrom:submitted`, `approve:submitted`, `approveUnderlying:submitted`, `unwrap:submitted`, `finalizeUnwrap:submitted` | `txHash`                                                         |
| Unshield orchestration | `unshield:phase1_submitted`, `unshield:phase2_started`, `unshield:phase2_submitted`                                                                                  | `txHash`, `operationId`                                          |

All events carry `tokenAddress`, `timestamp`, and an optional `operationId` (set on unshield phase events to correlate multi-step operations).

**Dispatching events to other systems:**

The `onEvent` callback is a simple function — you can bridge it to any event system:

```ts
// Fan out to multiple listeners with EventEmitter
import { EventEmitter } from "events";
const emitter = new EventEmitter();
const sdk = new ZamaSDK({
  // ...
  onEvent: (event) => emitter.emit(event.type, event),
});
emitter.on("encrypt:start", (e) => {
  /* listener A */
});
emitter.on("encrypt:start", (e) => {
  /* listener B */
});

// Bridge to DOM CustomEvent (e.g. for cross-framework communication)
const sdk = new ZamaSDK({
  // ...
  onEvent: (event) => window.dispatchEvent(new CustomEvent(event.type, { detail: event })),
});

// Collect into React state
const [events, setEvents] = useState<ZamaSDKEvent[]>([]);
const sdk = new ZamaSDK({
  // ...
  onEvent: (event) => setEvents((prev) => [...prev, event]),
});
```

### `RelayerWebConfig` (browser)

| Field        | Type                                  | Description                                                                                     |
| ------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getChainId` | `() => Promise<number>`               | Resolve the current chain ID. Called lazily; the worker is re-initialized on chain change.      |
| `transports` | `Record<number, FhevmInstanceConfig>` | Chain-specific configs keyed by chain ID (includes relayerUrl, network, contract addresses).    |
| `security`   | `RelayerWebSecurityConfig`            | Optional. Security options (see below).                                                         |
| `logger`     | `GenericLogger`                       | Optional. Logger for worker lifecycle and request timing.                                       |
| `threads`    | `number`                              | Optional. WASM thread count for parallel FHE ops (4–8 recommended). Requires COOP/COEP headers. |

#### `RelayerWebSecurityConfig`

| Field            | Type           | Description                                                                                      |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `getCsrfToken`   | `() => string` | Optional. Resolve the CSRF token before each authenticated network request.                      |
| `integrityCheck` | `boolean`      | Optional. Verify SHA-384 integrity of the CDN bundle. Defaults to `true`. Set `false` for tests. |

> **Security note:** `RelayerWeb` loads FHE WASM from a CDN at runtime. The `integrityCheck` option (enabled by default) verifies the SHA-384 hash of the bundle before execution, protecting against CDN compromise or MITM attacks. Only disable it in local development or testing.

### `RelayerNodeConfig` (Node.js)

| Field        | Type                                  | Description                                                                                        |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `getChainId` | `() => Promise<number>`               | Resolve the current chain ID. Called lazily; the pool is re-initialized on chain change.           |
| `transports` | `Record<number, FhevmInstanceConfig>` | Chain-specific configs keyed by chain ID (includes relayerUrl, network, auth, contract addresses). |

### Network Preset Configs

Both the main entry (`@zama-fhe/sdk`) and the `/node` sub-path re-export preset configs so you don't need to import from `@zama-fhe/relayer-sdk` directly:

| Config          | Chain ID | Description                         |
| --------------- | -------- | ----------------------------------- |
| `SepoliaConfig` | 11155111 | Sepolia testnet contract addresses. |
| `MainnetConfig` | 1        | Mainnet contract addresses.         |
| `HardhatConfig` | 31337    | Local Hardhat node addresses.       |

Each preset provides contract addresses and default relayer URL. Override `network` (RPC URL) for your environment. Browser apps should override `relayerUrl` with a proxy; server-side apps add `auth`:

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

// Browser — proxy through your backend
const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    relayerUrl: "https://your-app.com/api/relayer/11155111",
    network: "https://sepolia.infura.io/v3/KEY",
  },
};

// Node.js — auth is safe server-side
const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    network: "https://sepolia.infura.io/v3/KEY",
    auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
  },
};
```

## GenericSigner Interface

The `GenericSigner` interface has six methods. Any Web3 library can back it.

```ts
interface GenericSigner {
  getChainId(): Promise<number>;
  getAddress(): Promise<Address>;
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  writeContract(config: ContractCallConfig): Promise<Hex>;
  readContract(config: ContractCallConfig): Promise<unknown>;
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
}
```

### Built-in Adapters

**viem** — `@zama-fhe/sdk/viem`

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });
```

**ethers** — `@zama-fhe/sdk/ethers`

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ signer: ethersSigner });
```

## Contract Call Builders

Every function returns a `ContractCallConfig` object (address, ABI, function name, args) that can be used with any Web3 library. These are the low-level building blocks — they map 1:1 to on-chain contract calls without any orchestration. Use them when the high-level `Token` API doesn't cover your use case.

> **High-level vs low-level:** `token.shield()` / `token.unshield()` handle the full flow (approval, encryption, receipt waiting, finalization). The contract call builders (`wrapContract()`, `unwrapContract()`, etc.) produce raw call configs for a single contract interaction.

```ts
interface ContractCallConfig {
  readonly address: Address;
  readonly abi: readonly unknown[];
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
  readonly gas?: bigint;
}
```

### ERC-20

| Function                                   | Description              |
| ------------------------------------------ | ------------------------ |
| `nameContract(token)`                      | Read token name.         |
| `symbolContract(token)`                    | Read token symbol.       |
| `decimalsContract(token)`                  | Read token decimals.     |
| `balanceOfContract(token, owner)`          | Read ERC-20 balance.     |
| `allowanceContract(token, owner, spender)` | Read ERC-20 allowance.   |
| `approveContract(token, spender, value)`   | Approve ERC-20 spending. |

### Encryption (Confidential ERC-20)

| Function                                                                | Description                               |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `confidentialBalanceOfContract(token, user)`                            | Read encrypted balance handle.            |
| `confidentialTransferContract(token, to, handle, inputProof)`           | Encrypted transfer.                       |
| `confidentialTransferFromContract(token, from, to, handle, inputProof)` | Operator encrypted transfer.              |
| `isOperatorContract(token, holder, spender)`                            | Check operator approval.                  |
| `setOperatorContract(token, spender, timestamp?)`                       | Set operator approval (default: +1 hour). |
| `confidentialTotalSupplyContract(token)`                                | Read encrypted total supply handle.       |
| `totalSupplyContract(token)`                                            | Read plaintext total supply.              |
| `rateContract(token)`                                                   | Read conversion rate.                     |
| `deploymentCoordinatorContract(token)`                                  | Read deployment coordinator address.      |
| `isFinalizeUnwrapOperatorContract(token, holder, operator)`             | Check finalize-unwrap operator status.    |
| `setFinalizeUnwrapOperatorContract(token, operator, timestamp?)`        | Set finalize-unwrap operator.             |

### Wrapper

| Function                                                         | Description                                   |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `wrapContract(wrapper, to, amount)`                              | Wrap ERC-20 tokens.                           |
| `wrapETHContract(wrapper, to, amount, value)`                    | Wrap native ETH.                              |
| `unwrapContract(token, from, to, encryptedAmount, inputProof)`   | Request unwrap with encrypted amount.         |
| `unwrapFromBalanceContract(token, from, to, encryptedBalance)`   | Request unwrap using on-chain balance handle. |
| `finalizeUnwrapContract(wrapper, burntAmount, cleartext, proof)` | Finalize unwrap with decryption proof.        |
| `underlyingContract(wrapper)`                                    | Read underlying ERC-20 address.               |

### Deployment Coordinator

| Function                                    | Description                  |
| ------------------------------------------- | ---------------------------- |
| `getWrapperContract(coordinator, token)`    | Look up wrapper for a token. |
| `wrapperExistsContract(coordinator, token)` | Check if wrapper exists.     |

### ERC-165

| Function                                        | Description              |
| ----------------------------------------------- | ------------------------ |
| `supportsInterfaceContract(token, interfaceId)` | ERC-165 interface check. |

### Fee Manager

| Function                                             | Description                |
| ---------------------------------------------------- | -------------------------- |
| `getWrapFeeContract(feeManager, amount, from, to)`   | Calculate wrap fee.        |
| `getUnwrapFeeContract(feeManager, amount, from, to)` | Calculate unwrap fee.      |
| `getBatchTransferFeeContract(feeManager)`            | Get batch transfer fee.    |
| `getFeeRecipientContract(feeManager)`                | Get fee recipient address. |

### Transfer Batcher

| Function                                                                   | Description                         |
| -------------------------------------------------------------------------- | ----------------------------------- |
| `confidentialBatchTransferContract(batcher, token, from, transfers, fees)` | Batch multiple encrypted transfers. |

## Library-Specific Contract Helpers

Both the `/viem` and `/ethers` sub-paths export convenience wrappers that execute contract calls directly with library-native clients.

### viem (`@zama-fhe/sdk/viem`)

```ts
import {
  readConfidentialBalanceOfContract,
  writeConfidentialTransferContract,
  writeWrapContract,
  // ... more
} from "@zama-fhe/sdk/viem";

// Read: pass a PublicClient
const handle = await readConfidentialBalanceOfContract(publicClient, tokenAddress, userAddress);

// Write: pass a WalletClient
const txHash = await writeConfidentialTransferContract(
  walletClient,
  tokenAddress,
  to,
  handle,
  inputProof,
);
```

**Read helpers:** `readConfidentialBalanceOfContract`, `readUnderlyingTokenContract`, `readWrapperExistsContract`, `readSupportsInterfaceContract`, `readWrapperForTokenContract` (legacy — prefer `sdk.registry.getConfidentialToken()`).

**Write helpers:** `writeConfidentialTransferContract`, `writeConfidentialBatchTransferContract`, `writeUnwrapContract`, `writeUnwrapFromBalanceContract`, `writeFinalizeUnwrapContract`, `writeSetOperatorContract`, `writeWrapContract`, `writeWrapETHContract`.

### ethers (`@zama-fhe/sdk/ethers`)

Same set of functions, but read helpers take `Provider | Signer` and write helpers take `Signer`.

```ts
import {
  readConfidentialBalanceOfContract,
  writeConfidentialTransferContract,
} from "@zama-fhe/sdk/ethers";

const handle = await readConfidentialBalanceOfContract(provider, tokenAddress, userAddress);
const txHash = await writeConfidentialTransferContract(
  signer,
  tokenAddress,
  to,
  handle,
  inputProof,
);
```

## Event Decoders

Decode raw log entries from `eth_getLogs` into typed event objects.

### Topics

Use `TOKEN_TOPICS` as the `topics[0]` filter for `getLogs` to capture all confidential token events:

```ts
import { TOKEN_TOPICS } from "@zama-fhe/sdk";

const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
});
```

Individual topic hashes are accessible via the `Topics` object: `Topics.ConfidentialTransfer`, `Topics.Wrapped`, `Topics.UnwrapRequested`, `Topics.UnwrappedFinalized`, `Topics.UnwrappedStarted`.

### Decoders

| Function                          | Returns                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `decodeConfidentialTransfer(log)` | `ConfidentialTransferEvent \| null` — `{ from, to, encryptedAmountHandle }`                                            |
| `decodeWrapped(log)`              | `WrappedEvent \| null` — `{ mintAmount, amountIn, feeAmount, to, mintTxId }`                                           |
| `decodeUnwrapRequested(log)`      | `UnwrapRequestedEvent \| null` — `{ receiver, encryptedAmount }`                                                       |
| `decodeUnwrappedFinalized(log)`   | `UnwrappedFinalizedEvent \| null` — `{ burntAmountHandle, finalizeSuccess, burnAmount, unwrapAmount, feeAmount, ... }` |
| `decodeUnwrappedStarted(log)`     | `UnwrappedStartedEvent \| null` — `{ returnVal, requestId, txId, to, refund, requestedAmount, burnAmount }`            |
| `decodeOnChainEvent(log)`         | `OnChainEvent \| null` — tries all decoders                                                                            |
| `decodeOnChainEvents(logs)`       | `OnChainEvent[]` — batch decode, skips unrecognized logs                                                               |

### Finder Helpers

Convenience functions that decode a logs array and return the first matching event:

```ts
import { findWrapped, findUnwrapRequested } from "@zama-fhe/sdk";

const wrappedEvent = findWrapped(receipt.logs);
const unwrapEvent = findUnwrapRequested(receipt.logs);
```

## Activity Feed Helpers

Transform raw event logs into a user-friendly activity feed with decrypted amounts.

### Pipeline

```ts
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";

// 1. Parse raw logs into classified activity items
const items = parseActivityFeed(logs, userAddress);

// 2. Extract encrypted handles that need decryption
const handles = extractEncryptedHandles(items);

// 3. Decrypt handles (using your token instance)
const decryptedMap = await token.decryptHandles(handles);

// 4. Apply decrypted values back to activity items
const enrichedItems = applyDecryptedValues(items, decryptedMap);

// 5. Sort by block number (most recent first)
const sorted = sortByBlockNumber(enrichedItems);
```

### Types

```ts
type ActivityDirection = "incoming" | "outgoing" | "self";

type ActivityType =
  | "transfer"
  | "shield"
  | "unshield_requested"
  | "unshield_started"
  | "unshield_finalized";

type ActivityAmount =
  | { type: "clear"; value: bigint }
  | { type: "encrypted"; handle: string; decryptedValue?: bigint };

interface ActivityItem {
  type: ActivityType;
  direction: ActivityDirection;
  amount: ActivityAmount;
  from?: string;
  to?: string;
  fee?: ActivityAmount;
  success?: boolean;
  metadata: ActivityLogMetadata;
  rawEvent: OnChainEvent;
}

interface ActivityLogMetadata {
  transactionHash?: string;
  blockNumber?: bigint | number;
  logIndex?: number;
}
```

## Error Handling

All SDK errors extend `ZamaError`. Use `instanceof` to catch specific error types:

```ts
import { ZamaError, SigningRejectedError, EncryptionFailedError } from "@zama-fhe/sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // User rejected wallet signature
  }
  if (error instanceof EncryptionFailedError) {
    // FHE encryption failed
  }
  if (error instanceof ZamaError) {
    // Any other SDK error — check error.code for details
  }
}
```

### Error Classes

| Error Class                 | Code                     | Description                                                               |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `SigningRejectedError`      | `SIGNING_REJECTED`       | User rejected the wallet signature request.                               |
| `SigningFailedError`        | `SIGNING_FAILED`         | Wallet signature failed for a non-rejection reason.                       |
| `EncryptionFailedError`     | `ENCRYPTION_FAILED`      | FHE encryption operation failed.                                          |
| `DecryptionFailedError`     | `DECRYPTION_FAILED`      | FHE decryption operation failed.                                          |
| `ApprovalFailedError`       | `APPROVAL_FAILED`        | ERC-20 approval transaction failed.                                       |
| `TransactionRevertedError`  | `TRANSACTION_REVERTED`   | On-chain transaction reverted.                                            |
| `InvalidKeypairError`       | `INVALID_KEYPAIR`        | Relayer rejected FHE keypair (stale or expired).                          |
| `NoCiphertextError`         | `NO_CIPHERTEXT`          | No FHE ciphertext exists for this account (e.g. never shielded).          |
| `RelayerRequestFailedError` | `RELAYER_REQUEST_FAILED` | Relayer HTTP error. Carries a `statusCode` property with the HTTP status. |

### `matchZamaError`

Pattern-match on error codes without `instanceof` chains. Falls through to the `_` wildcard if no handler matches. Returns `undefined` for non-SDK errors when no `_` handler is provided.

```ts
import { matchZamaError } from "@zama-fhe/sdk";

matchZamaError(error, {
  SIGNING_REJECTED: () => toast("Please approve in wallet"),
  TRANSACTION_REVERTED: (e) => toast(`Tx failed: ${e.message}`),
  _: () => toast("Unknown error"),
});
```

**Distinguishing "no ciphertext" from "zero balance":**

```ts
import { NoCiphertextError, RelayerRequestFailedError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf();
} catch (error) {
  if (error instanceof NoCiphertextError) {
    // Account has never shielded — show "no confidential balance" in UI
  }
  if (error instanceof RelayerRequestFailedError) {
    console.error(`Relayer returned HTTP ${error.statusCode}`);
  }
}
```

### Unshield Progress Callbacks

`unshield()`, `unshieldAll()`, and `resumeUnshield()` accept optional callbacks for tracking progress through the two-phase unshield flow:

```ts
import type { UnshieldCallbacks } from "@zama-fhe/sdk";

const callbacks: UnshieldCallbacks = {
  onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
  onFinalizing: () => console.log("Waiting for decryption proof..."),
  onFinalizeSubmitted: (txHash) => console.log("Finalize tx:", txHash),
};

await token.unshield(500n, callbacks);
```

Callbacks are safe — a throwing callback will not interrupt the unshield flow.

## RelayerSDK (Low-Level FHE)

Low-level FHE operations are available on the relayer backend via `sdk.relayer`:

| Method                                                                      | Description                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `encrypt(params)`                                                           | Encrypt values for smart contract calls. Returns `{ handles, inputProof }`.            |
| `userDecrypt(params)`                                                       | Decrypt ciphertext handles with the user's FHE private key.                            |
| `publicDecrypt(handles)`                                                    | Public decryption (no private key needed). Returns `{ clearValues, decryptionProof }`. |
| `generateKeypair()`                                                         | Generate an FHE keypair. Returns `{ publicKey, privateKey }`.                          |
| `createEIP712(publicKey, contractAddresses, startTimestamp, durationDays?)` | Create EIP-712 typed data for decrypt authorization. Default duration: 7 days.         |
| `createDelegatedUserDecryptEIP712(...)`                                     | Create EIP-712 for delegated decryption.                                               |
| `delegatedUserDecrypt(params)`                                              | Decrypt via delegation.                                                                |
| `requestZKProofVerification(zkProof)`                                       | Submit a ZK proof for on-chain verification.                                           |
| `getPublicKey()`                                                            | Get the TFHE compact public key.                                                       |
| `getPublicParams(bits)`                                                     | Get public parameters for encryption capacity.                                         |
| `terminate()`                                                               | Terminate the backend and clean up resources.                                          |

## Constants

| Constant                       | Value                             | Description                                   |
| ------------------------------ | --------------------------------- | --------------------------------------------- |
| `ZERO_HANDLE`                  | `"0x0000...0000"` (32 zero bytes) | Sentinel for empty/zero encrypted values.     |
| `ERC7984_INTERFACE_ID`         | `"0x4958f2a4"`                    | ERC-165 interface ID for confidential tokens. |
| `ERC7984_WRAPPER_INTERFACE_ID` | `"0xd04584ba"`                    | ERC-165 interface ID for wrapper contracts.   |

## Exported ABIs

For direct use with viem, ethers, or any ABI-compatible library:

`ERC20_ABI`, `ERC20_METADATA_ABI`, `ENCRYPTION_ABI`, `WRAPPER_ABI`, `DEPLOYMENT_COORDINATOR_ABI`, `ERC165_ABI`, `FEE_MANAGER_ABI`, `TRANSFER_BATCHER_ABI`, `BATCH_SWAP_ABI`.
