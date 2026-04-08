---
title: ZamaSDK
description: Entry point for all confidential contract operations.
---

# ZamaSDK

Entry point for all confidential contract operations — creates tokens, manages sessions, and coordinates the relayer and signer.

## Import

```ts
import { ZamaSDK } from "@zama-fhe/sdk";
```

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { ZamaSDK, indexedDBStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { RelayerWeb, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

{% endtab %}
{% endtabs %}

## Constructor

### relayer

`RelayerWeb | RelayerNode`

Handles FHE encryption, decryption, and keypair management.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

### signer

`GenericSigner`

Wallet interface for signing transactions and typed data. Use `ViemSigner`, `EthersSigner`, `WagmiSigner`, or implement `GenericSigner`.

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

### storage

`GenericStorage`

Persists the encrypted FHE keypair across sessions. Use `indexedDBStorage` (browser), `memoryStorage` (tests), or `asyncLocalStorage` (Node.js servers).

```ts
import { indexedDBStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

---

### sessionStorage

`GenericStorage | undefined`

Stores wallet signatures for the current session. Defaults to in-memory storage. Use `chromeSessionStorage` for MV3 web extensions.

```ts
import { chromeSessionStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  sessionStorage: chromeSessionStorage,
});
```

### keypairTTL

`number | undefined`

FHE keypair validity duration in seconds. Default: `2592000` (30 days). After expiry, the next decrypt prompts a wallet signature to regenerate the keypair.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  keypairTTL: 604800, // 7 days
});
```

### sessionTTL

`number | "infinite" | undefined`

Session signature lifetime in seconds. Default: `2592000` (30 days). Set to `0` to require a wallet signature on every operation. Pass `"infinite"` for a session that never expires.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  sessionTTL: 3600, // 1 hour
});
```

### registryAddresses

`Record<number, Address> | undefined`

Per-chain wrappers registry address overrides, merged on top of built-in defaults. Use this for custom or local chains (e.g. Hardhat) where no default registry exists.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  registryAddresses: { [31337]: "0xYourHardhatRegistry" },
});
```

### registryTTL

`number | undefined`

How long cached registry results remain valid, in seconds. Default: `86400` (24 hours).

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  registryTTL: 3600, // 1 hour
});
```

### onEvent

`ZamaSDKEventListener | undefined`

Lifecycle event callback for debugging and telemetry. Events never contain sensitive data.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  onEvent: ({ type, tokenAddress, ...rest }) => {
    console.debug(`[zama] ${type}`, rest);
  },
});
```

## Properties

### cache

`DecryptCache` (readonly)

Persistent cache for decrypted FHE plaintext values. Backed by the same `GenericStorage` passed to the constructor (e.g. IndexedDB in browsers), so **cached values survive page reloads**.

Entries are scoped by `(requester, contractAddress, handle)` — a different signer cannot read another user's cached decryptions, mirroring the on-chain ACL. When the on-chain handle changes (e.g. after a transfer), the old entry is automatically a miss.

The cache is cleared automatically on:
- `revoke()` / `revokeSession()` — clears entries for the current signer
- Wallet disconnect, account change, or chain change — clears all entries

```ts
// Manual clear for the current signer
const address = await sdk.signer.getAddress();
await sdk.cache.clearForRequester(address);

// Clear everything
await sdk.cache.clearAll();
```

### registry

`WrappersRegistry` (readonly)

Auto-configured wrappers registry instance. Shares the SDK's signer, `registryAddresses`, and `registryTTL`. Prefer this over `createWrappersRegistry()` to benefit from a single shared cache.

```ts
const pairs = await sdk.registry.listPairs({ page: 1 });
const result = await sdk.registry.getConfidentialToken(erc20Address);
```

## Methods

### createToken

`(address: Address, wrapperAddress?: Address) => Token`

Creates a read/write token instance for shielding, transferring, and unshielding.

```ts
const token = sdk.createToken("0xEncryptedERC20");

// When the wrapper differs from the encrypted ERC-20 contract
const token = sdk.createToken("0xTokenAddress", "0xWrapperAddress");
```

### createReadonlyToken

`(address: Address) => ReadonlyToken`

Creates a read-only token instance for balance decryption and metadata queries.

```ts
const readonlyToken = sdk.createReadonlyToken("0xEncryptedERC20");
```

### createWrappersRegistry

`(registryAddresses?: Record<number, Address>) => WrappersRegistry`

Creates a wrappers registry instance for querying on-chain token wrapper pairs. On Mainnet and Sepolia the registry address is resolved automatically.

```ts
// Mainnet / Sepolia — resolved automatically
const registry = sdk.createWrappersRegistry();

// Hardhat or custom chain — override per chain
const registry = sdk.createWrappersRegistry({ [31337]: "0xYourRegistry" });

const pairs = await registry.getTokenPairs();
```

### decrypt

`(handles: DecryptHandle[], options?: DecryptOptions) => Promise<Record<Handle, ClearValueType>>`

Decrypt one or more FHE handles. Returns cached values when available, only calling the relayer for uncached handles. Results are written to the persistent cache (`sdk.cache`) so subsequent calls for the same handles return instantly.

Handles from different contracts can be mixed — they are grouped by `contractAddress` and batched into one relayer call per contract.

```ts
const values = await sdk.decrypt([
  { handle: balanceHandle, contractAddress: cUSDT },
  { handle: flagHandle, contractAddress: myContract },
]);
console.log(values[balanceHandle]); // 1000n
```

#### options

| Field | Type | Description |
| ----- | ---- | ----------- |
| `onCredentialsReady` | `(() => void) \| undefined` | Fired after credentials are ready (cached or freshly signed), **before** relayer calls begin. Not called when all handles are already cached. |
| `onDecrypted` | `((values: Record<Handle, ClearValueType>) => void) \| undefined` | Fired after all handles have been decrypted (including the all-cached path). |

```ts
const values = await sdk.decrypt(
  [{ handle: balanceHandle, contractAddress: cUSDT }],
  {
    onCredentialsReady: () => console.log("Credentials ready, decrypting..."),
    onDecrypted: (result) => console.log("Done:", result),
  },
);
```

{% hint style="info" %}
This is the SDK-level entry point for decryption. In React, use [`useUserDecrypt`](/reference/react/useUserDecrypt) which wraps this method with TanStack Query mutation semantics and passes its `onCredentialsReady` / `onDecrypted` callbacks through to `sdk.decrypt()`.
{% endhint %}

### allow

`(...addresses: Address[]) => Promise<void>`

Prompts the wallet to sign and caches session credentials for the given contract addresses. A single signature covers all addresses passed. Call early to avoid popups during balance decrypts.

```ts
await sdk.allow("0xTokenA", "0xTokenB");
```

### revoke

`(...addresses: Address[]) => Promise<void>`

Clears session credentials **and** cached decrypted values for the current signer. The addresses are included in the `credentials:revoked` event. The next decrypt requires a fresh wallet signature.

```ts
await sdk.revoke("0xTokenA", "0xTokenB");
```


### revokeSession

`() => Promise<void>`

Clears the session signature **and** cached decrypted values without specifying addresses. The next decrypt requires a fresh wallet signature.

```ts
await sdk.revokeSession();
```

### isAllowed

`(...contractAddresses: Address[]) => Promise<boolean>`

Returns whether the session has active credentials. When contract addresses are provided, also checks that the cached credentials cover all of them.

```ts
// Session-level check (any credentials cached?)
const allowed = await sdk.isAllowed();

// Contract-level check (credentials cover these contracts?)
const covered = await sdk.isAllowed("0xTokenA", "0xTokenB");
```


### dispose

`() => void`

Unsubscribes from signer lifecycle events (disconnect, account change, chain change) without terminating the relayer. Use when you want to stop reacting to wallet events but keep the relayer alive for other SDK instances.

```ts
sdk.dispose();
```

### terminate

`() => void`

Full cleanup — calls `dispose()` and terminates the Web Worker (browser) or thread pool (Node.js). Call when the SDK is no longer needed.

```ts
sdk.terminate();
```

## Related

- [Token](/reference/sdk/Token) — read/write token operations
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — read-only token operations
- [WrappersRegistry](/reference/sdk/WrappersRegistry) — on-chain token wrappers registry
- [Configuration guide](/guides/configuration) — relayer, signer, and storage setup
