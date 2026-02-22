# @zama-fhe/token-sdk

A TypeScript SDK for building privacy-preserving token applications using Fully Homomorphic Encryption (FHE). It abstracts the complexity of encrypted ERC-20 operations — shielding, unshielding, confidential transfers, and balance decryption — behind a clean, high-level API. Works with any Web3 library (viem, ethers, or custom signers).

## Installation

```bash
pnpm add @zama-fhe/token-sdk
```

### Peer dependencies

| Package                 | Version | Required?                                                |
| ----------------------- | ------- | -------------------------------------------------------- |
| `viem`                  | >= 2    | Optional — for the `@zama-fhe/token-sdk/viem` adapter    |
| `ethers`                | >= 6    | Optional — for the `@zama-fhe/token-sdk/ethers` adapter  |
| `@zama-fhe/relayer-sdk` | >= 0.4  | Optional — only for `@zama-fhe/token-sdk/node` (Node.js) |

## Quick Start

### Browser

```ts
import { TokenSDK, RelayerWeb, SepoliaConfig, IndexedDBStorage } from "@zama-fhe/token-sdk";
import { ViemSigner } from "@zama-fhe/token-sdk/viem";

// 1. Create the SDK with a browser backend (Web Worker)
const sdk = new TokenSDK({
  relayer: new RelayerWeb({
    chainId: 11155111, // Sepolia
    transports: {
      [11155111]: {
        ...SepoliaConfig,
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer: new ViemSigner(walletClient, publicClient),
  storage: new IndexedDBStorage(),
});

// 2. Create a token instance (wrapper is auto-discovered if omitted)
const token = sdk.createToken("0xEncryptedERC20Address");
// Or provide the wrapper explicitly:
// const token = sdk.createToken("0xEncryptedERC20Address", "0xWrapperAddress");

// 3. Shield (wrap) public tokens into confidential tokens
const wrapTx = await token.wrap(1000n);

// 4. Check decrypted balance
const balance = await token.balanceOf();
console.log("Confidential balance:", balance);

// 5. Transfer confidential tokens
const transferTx = await token.confidentialTransfer("0xRecipient", 500n);
```

### Node.js

```ts
import { TokenSDK, MemoryStorage } from "@zama-fhe/token-sdk";
import { RelayerNode, SepoliaConfig } from "@zama-fhe/token-sdk/node";
import { ViemSigner } from "@zama-fhe/token-sdk/viem";

const sdk = new TokenSDK({
  relayer: new RelayerNode({
    chainId: 11155111, // Sepolia
    transports: {
      [11155111]: {
        ...SepoliaConfig,
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer: new ViemSigner(walletClient, publicClient),
  storage: new MemoryStorage(),
});

const token = sdk.createToken("0xEncryptedERC20Address");
const balance = await token.balanceOf();
```

## Core Concepts

### TokenSDK

Entry point to the SDK. Composes a relayer backend with a signer and storage layer. Acts as a factory for token instances.

```ts
const sdk = new TokenSDK({
  relayer, // RelayerSDK — either RelayerWeb (browser) or RelayerNode (Node.js)
  signer, // ConfidentialSigner
  storage, // GenericStringStorage
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

| Backend       | Import                     | Environment | How it works                               |
| ------------- | -------------------------- | ----------- | ------------------------------------------ |
| `RelayerWeb`  | `@zama-fhe/token-sdk`      | Browser     | Runs WASM in a Web Worker via CDN          |
| `RelayerNode` | `@zama-fhe/token-sdk/node` | Node.js     | Uses `@zama-fhe/relayer-sdk/node` directly |

The `/node` sub-path also exports `NodeWorkerClient` and `NodeWorkerClientConfig` for running FHE operations in a Node.js worker thread.

You can also implement the `RelayerSDK` interface for custom backends.

### Token

Full read/write interface for a single confidential ERC-20. Extends `ReadonlyToken`. The encrypted ERC-20 contract IS the wrapper, so `wrapper` defaults to the token `address`. Pass an explicit `wrapper` only if they differ.

| Method                                    | Description                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wrap(amount, options?)`                  | Shield (wrap) public ERC-20 tokens. Handles approval automatically. Options: `{ approvalStrategy: "max" \| "exact" \| "skip" }` (default `"exact"`). `"skip"` bypasses approval (use when already approved). |
| `wrapETH(amount, value?)`                 | Shield (wrap) native ETH. `value` defaults to `amount`. Use this when the underlying token is the zero address (native ETH).                                                                                 |
| `unshield(amount)`                        | Unwrap a specific amount and finalize in one call. Orchestrates: unwrap → wait receipt → parse event → finalizeUnwrap.                                                                                       |
| `unshieldAll()`                           | Unwrap the entire balance and finalize in one call. Orchestrates: unwrapAll → wait receipt → parse event → finalizeUnwrap.                                                                                   |
| `unwrap(amount)`                          | Request unwrap for a specific amount (low-level, requires manual finalization).                                                                                                                              |
| `unwrapAll()`                             | Request unwrap for the entire balance (low-level, requires manual finalization).                                                                                                                             |
| `finalizeUnwrap(burnAmountHandle)`        | Complete unwrap with public decryption proof.                                                                                                                                                                |
| `confidentialTransfer(to, amount)`        | Encrypted transfer. Encrypts amount, then calls the contract.                                                                                                                                                |
| `confidentialTransferFrom(from, to, amt)` | Operator encrypted transfer.                                                                                                                                                                                 |
| `approve(spender, until?)`                | Set operator approval. `until` defaults to now + 1 hour.                                                                                                                                                     |
| `isApproved(spender)`                     | Check if a spender is an approved operator.                                                                                                                                                                  |
| `approveUnderlying(amount?)`              | Approve wrapper to spend underlying ERC-20. Default: max uint256.                                                                                                                                            |
| `balanceOf(owner?)`                       | Decrypt and return the plaintext balance.                                                                                                                                                                    |
| `decryptHandles(handles, owner?)`         | Batch-decrypt arbitrary encrypted handles.                                                                                                                                                                   |

All write methods return the transaction hash (`Address`).

### ReadonlyToken

Read-only subset. No wrapper address needed.

| Method                                | Description                                                       |
| ------------------------------------- | ----------------------------------------------------------------- |
| `balanceOf(owner?)`                   | Decrypt and return the plaintext balance.                         |
| `confidentialBalanceOf(owner?)`       | Return the raw encrypted balance handle (no decryption).          |
| `decryptBalance(handle, owner?)`      | Decrypt a single encrypted handle.                                |
| `decryptHandles(handles, owner?)`     | Batch-decrypt handles in a single relayer call.                   |
| `authorize()`                         | Ensure FHE decrypt credentials exist (generates/signs if needed). |
| `authorizeAll(tokens)` _(static)_     | Pre-authorize multiple tokens with a single wallet signature.     |
| `isConfidential()`                    | ERC-165 check for ERC-7984 support.                               |
| `isWrapper()`                         | ERC-165 check for wrapper interface.                              |
| `discoverWrapper(coordinatorAddress)` | Look up a wrapper for this token via the deployment coordinator.  |
| `underlyingToken()`                   | Read the underlying ERC-20 address from a wrapper.                |
| `allowance(wrapper, owner?)`          | Read ERC-20 allowance of the underlying token.                    |
| `isZeroHandle(handle)`                | Returns `true` if the handle is the zero sentinel.                |
| `name()` / `symbol()` / `decimals()`  | Read token metadata.                                              |

Static methods for multi-token operations:

```ts
// Pre-authorize all tokens with a single wallet signature
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));
await ReadonlyToken.authorizeAll(tokens);
// All subsequent decrypts reuse cached credentials — no more wallet prompts

// Decrypt balances for multiple tokens in parallel
const balances = await ReadonlyToken.batchBalanceOf(tokens, owner);

// Decrypt pre-fetched handles for multiple tokens
const balances = await ReadonlyToken.batchDecryptBalances(tokens, handles, owner);
```

### Storage

FHE credentials (keypair + EIP-712 signature) are persisted to storage. Three options:

| Storage            | Use case                                          |
| ------------------ | ------------------------------------------------- |
| `MemoryStorage`    | Testing. In-memory `Map`, lost on page reload.    |
| `IndexedDBStorage` | Browser production. IndexedDB-backed, persistent. |
| `indexedDBStorage` | Pre-built singleton `IndexedDBStorage` instance.  |
| Custom             | Implement the `GenericStringStorage` interface.   |

```ts
interface GenericStringStorage {
  getItem(key: string): string | Promise<string | null> | null;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

## Configuration Reference

### `TokenSDKConfig`

| Field     | Type                   | Description                                              |
| --------- | ---------------------- | -------------------------------------------------------- |
| `relayer` | `RelayerSDK`           | Relayer backend (`RelayerWeb` or `RelayerNode` instance) |
| `signer`  | `ConfidentialSigner`   | Wallet signer interface.                                 |
| `storage` | `GenericStringStorage` | Credential storage backend.                              |

### `RelayerWebConfig` (browser)

| Field        | Type                                  | Description                                                                                  |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `chainId`    | `number`                              | Active chain ID (1 = mainnet, 11155111 = Sepolia, 31337 = Hardhat).                          |
| `transports` | `Record<number, FhevmInstanceConfig>` | Chain-specific configs keyed by chain ID (includes relayerUrl, network, contract addresses). |
| `csrfToken`  | `string \| (() => string)`            | Optional CSRF token for relayer requests.                                                    |

### `RelayerNodeConfig` (Node.js)

| Field        | Type                                  | Description                                                                                        |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `chainId`    | `number`                              | Active chain ID (1 = mainnet, 11155111 = Sepolia, 31337 = Hardhat).                                |
| `transports` | `Record<number, FhevmInstanceConfig>` | Chain-specific configs keyed by chain ID (includes relayerUrl, network, auth, contract addresses). |

### Network Preset Configs

Both the main entry (`@zama-fhe/token-sdk`) and the `/node` sub-path re-export preset configs so you don't need to import from `@zama-fhe/relayer-sdk` directly:

| Config          | Chain ID | Description                         |
| --------------- | -------- | ----------------------------------- |
| `SepoliaConfig` | 11155111 | Sepolia testnet contract addresses. |
| `MainnetConfig` | 1        | Mainnet contract addresses.         |
| `HardhatConfig` | 31337    | Local Hardhat node addresses.       |

Each preset provides contract addresses and default values. Override `relayerUrl` and `network` (RPC URL) for your environment:

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/token-sdk";

const transports = {
  [11155111]: {
    ...SepoliaConfig,
    relayerUrl: "/api/proxy",
    network: "https://sepolia.infura.io/v3/KEY",
  },
  [1]: {
    ...MainnetConfig,
    relayerUrl: "/api/proxy",
    network: "https://mainnet.infura.io/v3/KEY",
  },
};
```

## Signer Interface

The `ConfidentialSigner` interface has five methods. Any Web3 library can back it.

```ts
interface ConfidentialSigner {
  getAddress(): Promise<Address>;
  signTypedData(typedData: EIP712TypedData): Promise<Address>;
  writeContract(config: ContractCallConfig): Promise<Address>;
  readContract(config: ContractCallConfig): Promise<unknown>;
  waitForTransactionReceipt(hash: Address): Promise<TransactionReceipt>;
}
```

### Built-in Adapters

**viem** — `@zama-fhe/token-sdk/viem`

```ts
import { ViemSigner } from "@zama-fhe/token-sdk/viem";

const signer = new ViemSigner(walletClient, publicClient);
```

**ethers** — `@zama-fhe/token-sdk/ethers`

```ts
import { EthersSigner } from "@zama-fhe/token-sdk/ethers";

const signer = new EthersSigner(ethersSigner);
```

## Contract Call Builders

Every function returns a `ContractCallConfig` object (address, ABI, function name, args) that can be used with any Web3 library. These are the low-level building blocks — they map 1:1 to on-chain contract calls without any orchestration. Use them when the high-level `Token` API doesn't cover your use case.

> **High-level vs low-level:** `token.wrap()` / `token.unshield()` handle the full flow (approval, encryption, receipt waiting, finalization). The contract call builders (`wrapContract()`, `unwrapContract()`, etc.) produce raw call configs for a single contract interaction.

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

### viem (`@zama-fhe/token-sdk/viem`)

```ts
import {
  readConfidentialBalanceOfContract,
  writeConfidentialTransferContract,
  writeWrapContract,
  // ... more
} from "@zama-fhe/token-sdk/viem";

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

**Read helpers:** `readConfidentialBalanceOfContract`, `readWrapperForTokenContract`, `readUnderlyingTokenContract`, `readWrapperExistsContract`, `readSupportsInterfaceContract`.

**Write helpers:** `writeConfidentialTransferContract`, `writeConfidentialBatchTransferContract`, `writeUnwrapContract`, `writeUnwrapFromBalanceContract`, `writeFinalizeUnwrapContract`, `writeSetOperatorContract`, `writeWrapContract`, `writeWrapETHContract`.

### ethers (`@zama-fhe/token-sdk/ethers`)

Same set of functions, but read helpers take `Provider | Signer` and write helpers take `Signer`.

```ts
import {
  readConfidentialBalanceOfContract,
  writeConfidentialTransferContract,
} from "@zama-fhe/token-sdk/ethers";

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
import { TOKEN_TOPICS } from "@zama-fhe/token-sdk";

const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
});
```

Individual topic constants are also exported: `CONFIDENTIAL_TRANSFER_TOPIC`, `WRAPPED_TOPIC`, `UNWRAP_REQUESTED_TOPIC`, `UNWRAPPED_FINALIZED_TOPIC`, `UNWRAPPED_STARTED_TOPIC`.

### Decoders

| Function                          | Returns                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `decodeConfidentialTransfer(log)` | `ConfidentialTransferEvent \| null` — `{ from, to, encryptedAmountHandle }`                                            |
| `decodeWrapped(log)`              | `WrappedEvent \| null` — `{ mintAmount, amountIn, feeAmount, to, mintTxId }`                                           |
| `decodeUnwrapRequested(log)`      | `UnwrapRequestedEvent \| null` — `{ receiver, encryptedAmount }`                                                       |
| `decodeUnwrappedFinalized(log)`   | `UnwrappedFinalizedEvent \| null` — `{ burntAmountHandle, finalizeSuccess, burnAmount, unwrapAmount, feeAmount, ... }` |
| `decodeUnwrappedStarted(log)`     | `UnwrappedStartedEvent \| null` — `{ returnVal, requestId, txId, to, refund, requestedAmount, burnAmount }`            |
| `decodeTokenEvent(log)`           | `TokenEvent \| null` — tries all decoders                                                                              |
| `decodeTokenEvents(logs)`         | `TokenEvent[]` — batch decode, skips unrecognized logs                                                                 |

### Finder Helpers

Convenience functions that decode a logs array and return the first matching event:

```ts
import { findWrapped, findUnwrapRequested } from "@zama-fhe/token-sdk";

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
} from "@zama-fhe/token-sdk";

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
  rawEvent: TokenEvent;
}

interface ActivityLogMetadata {
  transactionHash?: string;
  blockNumber?: bigint | number;
  logIndex?: number;
}
```

## Error Handling

All SDK errors are instances of `TokenError`:

```ts
import { TokenError, TokenErrorCode } from "@zama-fhe/token-sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof TokenError) {
    switch (error.code) {
      case TokenErrorCode.SigningRejected:
        // User rejected wallet signature
        break;
      case TokenErrorCode.EncryptionFailed:
        // FHE encryption failed
        break;
    }
  }
}
```

### Error Codes

| Code                   | Constant              | Description                                         |
| ---------------------- | --------------------- | --------------------------------------------------- |
| `SIGNING_REJECTED`     | `SigningRejected`     | User rejected the wallet signature request.         |
| `SIGNING_FAILED`       | `SigningFailed`       | Wallet signature failed for a non-rejection reason. |
| `ENCRYPTION_FAILED`    | `EncryptionFailed`    | FHE encryption operation failed.                    |
| `DECRYPTION_FAILED`    | `DecryptionFailed`    | FHE decryption operation failed.                    |
| `NOT_CONFIDENTIAL`     | `NotConfidential`     | Token does not support the ERC-7984 interface.      |
| `NOT_WRAPPER`          | `NotWrapper`          | Token does not support the wrapper interface.       |
| `APPROVAL_FAILED`      | `ApprovalFailed`      | ERC-20 approval transaction failed.                 |
| `TRANSACTION_REVERTED` | `TransactionReverted` | On-chain transaction reverted.                      |
| `STORE_ERROR`          | `StoreError`          | Credential storage read/write failed.               |

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
