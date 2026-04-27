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
  provider,
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% tab title="config.ts (createConfig)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk";
import { sepolia, mainnet } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia, mainnet],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: web(),
    [mainnet.id]: web(),
  },
});

// config contains { relayer, provider, signer, storage } ready for new ZamaSDK(config)
```

{% endtab %}
{% endtabs %}

## Constructor

### relayer

`RelayerDispatcher`

Handles FHE encryption, decryption, and keypair management.

```ts
const sdk = new ZamaSDK({
  relayer,
  provider,
  signer,
  storage: indexedDBStorage,
});
```

### provider

`GenericProvider`

Read-only provider for contract reads and transaction receipt polling. Created automatically by `createConfig`, or implement `GenericProvider` manually.

```ts
const sdk = new ZamaSDK({
  relayer,
  provider,
  signer,
  storage: indexedDBStorage,
});
```

### signer

`GenericSigner`

Wallet interface for signing transactions and typed data. Use `ViemSigner`, `EthersSigner`, `WagmiSigner`, or implement `GenericSigner`.

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient });
const sdk = new ZamaSDK({
  relayer,
  provider,
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
  provider,
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
  provider,
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
  provider,
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
  provider,
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
  provider,
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
  provider,
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
  provider,
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

Auto-configured wrappers registry instance. Shares the SDK's provider, `registryAddresses`, and `registryTTL`. Prefer this over `createWrappersRegistry()` to benefit from a single shared cache.

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

### allow

`(contractAddresses: Address[]) => Promise<void>`

Pre-authorize contract addresses for decryption, triggering a single wallet signature prompt. Subsequent [`userDecrypt`](#userdecrypt) calls whose handles span the same set reuse the cached credentials without another prompt.

```ts
// Sign once for three tokens, then decrypt individually
await sdk.allow([cUSDT, cDAI, cWETH]);
const a = await sdk.userDecrypt([{ handle: h1, contractAddress: cUSDT }]);
const b = await sdk.userDecrypt([{ handle: h2, contractAddress: cDAI }]);
```

### userDecrypt

`(handles: DecryptHandle[]) => Promise<Record<Handle, ClearValueType>>`

Decrypt one or more FHE handles. Returns cached values when available, only calling the relayer for uncached handles. Results are written to the persistent cache (`sdk.cache`) so subsequent calls for the same handles return instantly.

Handles from different contracts can be mixed — they are grouped by `contractAddress` and batched into one relayer call per contract (up to 5 concurrently). Zero handles (32 zero bytes) resolve to `0n` without hitting the relayer.

When the relayer is actually called, credentials are derived from the contract addresses of the full input handle set (including cached and zero handles), ensuring a stable credential cache key regardless of which handles happen to be cached. If every handle is zero or already cached, no credentials are acquired and no wallet prompt is shown.

```ts
const values = await sdk.userDecrypt([
  { handle: balanceHandle, contractAddress: cUSDT },
  { handle: flagHandle, contractAddress: myContract },
]);
console.log(values[balanceHandle]); // 1000n
```

To observe decryption lifecycle, subscribe to SDK events (`DecryptStart`, `DecryptEnd`, `DecryptError`) via the `onEvent` config. Events fire only when the relayer is actually called — the zero-handle-only and fully-cached paths return silently.

The `onEvent` callback is a single function, so for multi-listener observability you can bridge it into a standard event bus. Pick whichever matches your runtime:

{% tabs %}
{% tab title="Browser (CustomEvent)" %}

```ts
import {
  ZamaSDK,
  ZamaSDKEvents,
  type DecryptEndEvent,
  type DecryptErrorEvent,
} from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  provider,
  signer,
  storage,
  onEvent: (event) => {
    window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
  },
});

window.addEventListener(ZamaSDKEvents.DecryptEnd, (e: CustomEvent<DecryptEndEvent>) => {
  const { durationMs, handles, result } = e.detail;
  console.log(`Decrypted ${handles.length} handle(s) in ${durationMs}ms`);
  // result is Record<Handle, ClearValueType> — look up a specific handle
  for (const h of handles) {
    console.log(`${h} → ${result[h]}`);
  }
});

window.addEventListener(ZamaSDKEvents.DecryptError, (e: CustomEvent<DecryptErrorEvent>) => {
  const { error, durationMs, handles } = e.detail;
  console.error(`Decryption failed after ${durationMs}ms for ${handles.length} handle(s):`, error);
});
```

{% endtab %}

{% tab title="Node (EventEmitter)" %}

```ts
import { EventEmitter } from "node:events";
import {
  ZamaSDK,
  ZamaSDKEvents,
  type DecryptEndEvent,
  type DecryptErrorEvent,
} from "@zama-fhe/sdk";

const emitter = new EventEmitter();

const sdk = new ZamaSDK({
  relayer,
  provider,
  signer,
  storage,
  onEvent: (event) => emitter.emit(event.type, event),
});

emitter.on(ZamaSDKEvents.DecryptEnd, ({ durationMs, handles, result }: DecryptEndEvent) => {
  console.log(`Decrypted ${handles.length} handle(s) in ${durationMs}ms`);
  // result is Record<Handle, ClearValueType> — look up a specific handle
  for (const h of handles) {
    console.log(`${h} → ${result[h]}`);
  }
});

emitter.on(ZamaSDKEvents.DecryptError, ({ error, durationMs, handles }: DecryptErrorEvent) => {
  console.error(`Decryption failed after ${durationMs}ms for ${handles.length} handle(s):`, error);
});
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
This is the SDK-level entry point for user decryption. The method is named `userDecrypt` (not `decrypt`) because it requires the connected wallet's credentials — distinguishing it from gateway-level decryption that happens on-chain without user authentication. In React, use [`useUserDecrypt`](/reference/react/useUserDecrypt) which wraps this method with TanStack Query semantics.
{% endhint %}

### revokeSession

`() => Promise<void>`

Clears the session signature **and** cached decrypted values without specifying addresses. The next decrypt requires a fresh wallet signature.

```ts
await sdk.revokeSession();
```

`revokeSession()` targets the live signer identity at invocation time. Call it before disconnecting a wallet, or rely on signer lifecycle cleanup to revoke the previous identity during disconnect, account change, or chain change handling.

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
