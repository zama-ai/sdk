---
title: ZamaSDK
description: Entry point for all confidential contract operations.
---

# ZamaSDK

Entry point for all confidential contract operations — creates tokens, manages permits, and coordinates the relayer and signer.

## Import

```ts
import { ZamaSDK } from "@zama-fhe/sdk";
```

## Usage

{% tabs %}
{% tab title="viem" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
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

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="custom signer" %}

```ts
import { createConfig, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  signer: myCustomSigner, // GenericSigner
  provider: myCustomProvider, // GenericProvider
  storage: memoryStorage,
  relayers: { [sepolia.id]: node({ poolSize: 4 }) },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
`ZamaConfig` is a branded type — always obtain it via `createConfig()` (or an adapter-specific factory like `createConfig` from `@zama-fhe/sdk/viem`). Do not construct the config object by hand.
{% endhint %}

## createConfig options

All options below are passed to `createConfig()`, which validates them and returns a `ZamaConfig` for the `ZamaSDK` constructor.

### chains

`readonly FheChain[]`

FHE chain configurations. At least one chain is required. Use built-in presets from `@zama-fhe/sdk/chains`.

```ts
import { sepolia, mainnet } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia, mainnet],
  // ...
});
```

### relayers

`Record<number, RelayerConfig>`

Per-chain relayer factories. Each chain in `chains` must have a matching entry.

```ts
import { web } from "@zama-fhe/sdk/web";

const config = createConfig({
  chains: [sepolia],
  relayers: { [sepolia.id]: web() },
  // ...
});
```

### provider / signer

Created automatically by adapter-specific `createConfig` (viem, ethers, wagmi). For the generic `createConfig` from `@zama-fhe/sdk`, pass a `GenericProvider` and optionally a `GenericSigner`. Omit the signer for read-only usage (indexers, SSR). Signer-dependent operations throw `SignerNotConfiguredError` when invoked without a signer.

### storage

`GenericStorage | undefined`

Persists the encrypted FHE keypair across sessions. Use `indexedDBStorage` (browser), `memoryStorage` (tests), or `asyncLocalStorage` (Node.js servers). Defaults to `indexedDBStorage` in browsers, `memoryStorage` elsewhere.

### permitStorage

`GenericStorage | undefined`

Optional dedicated storage for permits. Defaults to `storage`. Use this to keep permits out of long-lived storage (e.g. IndexedDB for keypair, memory for permits) for high-security flows.

### keypairTTL

`number | undefined`

FHE keypair validity duration in seconds. Default: `2592000` (30 days). Must be a positive integer. After expiry, the next decrypt prompts a wallet signature to regenerate the keypair.

### permitTTL

`number | undefined`

Permit lifetime in days. Default: `30`. Controls how long each signed EIP-712 permit remains valid.

### registryTTL

`number | undefined`

How long cached registry results remain valid, in seconds. Default: `86400` (24 hours). Must be a non-negative integer.

### onEvent

`ZamaSDKEventListener | undefined`

Lifecycle event callback for debugging and telemetry. Events never contain sensitive data.

```ts
const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: web() },
  onEvent: ({ type, tokenAddress, ...rest }) => {
    console.debug(`[zama] ${type}`, rest);
  },
});
```

## Properties

### registry

`WrappersRegistry` (readonly)

Auto-configured wrappers registry instance. Shares the SDK's provider, chain registry addresses, and `registryTTL`. Prefer this over `createWrappersRegistry()` to benefit from a single shared cache.

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

Creates a wrappers registry instance for querying on-chain token wrapper pairs. Registry addresses come from built-in defaults, configured chain definitions, and optional overrides passed to this method.

```ts
// Mainnet / Sepolia — resolved automatically
const registry = sdk.createWrappersRegistry();

// Hardhat or custom chain — override per chain for this registry instance
const registry = sdk.createWrappersRegistry({ [31337]: "0xYourRegistry" });

const pairs = await registry.getTokenPairs();
```

### allow

`(contractAddresses: Address[]) => Promise<void>`

Pre-authorize contract addresses for decryption. Signs permits only for contracts not already covered by existing permits. Subsequent [`userDecrypt`](#userdecrypt) calls whose handles span the covered set proceed without a wallet prompt.

```ts
// Sign once for three tokens, then decrypt individually
await sdk.allow([cUSDT, cDAI, cWETH]);
const a = await sdk.userDecrypt([{ handle: h1, contractAddress: cUSDT }]);
const b = await sdk.userDecrypt([{ handle: h2, contractAddress: cDAI }]);
```

### userDecrypt

`(handles: DecryptHandle[]) => Promise<Record<Handle, ClearValueType>>`

Decrypt one or more FHE handles. Returns cached values when available, only calling the relayer for uncached handles. Results are written through the SDK's internal CachingService so subsequent calls for the same handles return instantly.

Handles from different contracts can be mixed — they are grouped by `contractAddress` and batched into one relayer call per contract (up to 5 concurrently). Zero handles (32 zero bytes) resolve to `0n` without hitting the relayer.

When the relayer is actually called, permits are resolved from the contract addresses of the full input handle set (including cached and zero handles), ensuring a stable permit scope regardless of which handles happen to be cached. If every handle is zero or already cached, no permits are needed and no wallet prompt is shown.

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

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: web() },
  onEvent: (event) => {
    window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
  },
});
const sdk = new ZamaSDK(config);

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

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: node() },
  onEvent: (event) => emitter.emit(event.type, event),
});
const sdk = new ZamaSDK(config);

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

### onWalletAccountChange

`(listener: (change: WalletAccountChange) => void) => () => void`

Subscribe to wallet account transitions (connect, disconnect, account change, chain change). Returns an unsubscribe function. Each transition carries `previous` and `next` wallet account objects (`{ address, chainId }`).

```ts
const unsubscribe = sdk.onWalletAccountChange(({ previous, next }) => {
  if (!next) console.log("Wallet disconnected");
  else console.log(`Switched to ${next.address} on chain ${next.chainId}`);
});
```

### revokePermits

`(contracts?: Address[]) => Promise<void>`

Remove signed permits for the current signer. With a contract list, removes permits on the current chain whose payload touches any listed address. Without arguments, removes all permits across all chains and delegators. The keypair is not affected.

```ts
await sdk.revokePermits(["0xTokenA"]); // current chain only
await sdk.revokePermits(); // all permits, all chains
```

### clearCredentials

`() => Promise<void>`

Wipe the keypair **and** cascade-delete every permit for the current signer. Use for "log out" flows.

```ts
await sdk.clearCredentials();
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
