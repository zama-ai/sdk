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
  relayers: { [sepolia.id]: web(), [mainnet.id]: web() },
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
  relayers: { [sepolia.id]: node() },
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

Persists the encrypted transport key pair across sessions. Use `indexedDBStorage` (browser), `memoryStorage` (tests), or `asyncLocalStorage` (Node.js servers). Defaults to `indexedDBStorage` in browsers, `memoryStorage` elsewhere.

### permitStorage

`GenericStorage | undefined`

Optional dedicated storage for permits. Defaults to `storage`. Use this to keep permits out of long-lived storage (e.g. IndexedDB for transport key pair, memory for permits) for high-security flows.

### transportKeyPairTTL

`number | undefined`

Transport key pair validity duration in seconds. Default: `2592000` (30 days). Must be a positive integer. After expiry, the next decrypt prompts a wallet signature to regenerate the key pair.

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

`(address: Address) => Token`

Creates a [`Token`](Token.md) instance for an ERC-7984 confidential token. Supports balance reads, encrypted transfers, operator approvals, and delegated decryption.

```ts
const token = sdk.createToken("0xConfidentialToken");
```

### createWrappedToken

`(address: Address) => WrappedToken`

Creates a [`WrappedToken`](WrappedToken.md) instance for an ERC-7984 ERC-20 wrapper. Adds wrapper-specific operations (shield, unshield, allowance) on top of the base `Token` API. The address is the wrapper contract itself — the wrapper IS the confidential token.

```ts
const wrappedToken = sdk.createWrappedToken("0xWrapper");
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

### permits.grantPermit

`(contractAddresses: Address[]) => Promise<void>`

Pre-authorize contract addresses for decryption. Signs permits only for contracts not already covered by existing permits. Subsequent [`decryption.decryptValues`](#decryption-decryptvalues) calls whose encrypted values span the covered set proceed without a wallet prompt.

```ts
// Sign once for three tokens, then decrypt individually
await sdk.permits.grantPermit([cUSDT, cDAI, cWETH]);
const a = await sdk.decryption.decryptValues([{ encryptedValue: h1, contractAddress: cUSDT }]);
const b = await sdk.decryption.decryptValues([{ encryptedValue: h2, contractAddress: cDAI }]);
```

### permits.hasPermit

`(contractAddresses: Address[]) => Promise<boolean>`

Checks whether the current signer already has stored permits covering every requested contract address. This is a pure storage lookup: it does not prompt the wallet and returns `false` when the SDK has no signer.

```ts
const hasPermit = await sdk.permits.hasPermit([cUSDT, cDAI]);
if (!hasPermit) {
  showAuthorizeButton();
}
```

Use this for UI state. `sdk.permits.grantPermit()` is already idempotent and skips the wallet prompt when a covering permit exists.

### permits.grantDelegationPermit

`(delegator: Address, contractAddresses: Address[]) => Promise<void>`

Signs and stores a delegated-decryption permit for contracts that the connected signer will decrypt on behalf of `delegator`. The on-chain delegation must already exist and have propagated before delegated decryption succeeds.

```ts
await sdk.permits.grantDelegationPermit(delegator, [cUSDT]);
```

### permits.hasDelegationPermit

`(delegator: Address, contractAddresses: Address[]) => Promise<boolean>`

Checks whether the current signer has stored delegated-decryption permits for `delegator` and every requested contract.

```ts
const ready = await sdk.permits.hasDelegationPermit(delegator, [cUSDT]);
```

### decryption.decryptValues

`(inputs: DecryptInput[]) => Promise<Record<EncryptedValue, ClearValue>>`

{% hint style="info" %}
Renamed from `decryption.userDecrypt` (then briefly `decryptValuesFromPairs`) to align with the Zama glossary and the SDK's single-entrypoint design (prerelease rename). If you were on an old name, update call sites to `decryptValues`.
{% endhint %}

Decrypt one or more FHE encrypted values. Returns cached values when available, only calling the relayer for uncached inputs. Results are written through the SDK's internal CachingService so subsequent calls for the same inputs return instantly.

Inputs from different contracts can be mixed — they are grouped by `contractAddress` and batched into one relayer call per contract (up to 5 concurrently). Zero encrypted values (32 zero bytes) resolve to `0n` without hitting the relayer.

When the relayer is actually called, permits are resolved from the contract addresses of the full input set (including cached and zero entries), ensuring a stable permit scope regardless of which entries happen to be cached. If every entry is zero or already cached, no permits are needed and no wallet prompt is shown.

```ts
const values = await sdk.decryption.decryptValues([
  { encryptedValue: balance, contractAddress: cUSDT },
  { encryptedValue: flag, contractAddress: myContract },
]);
console.log(values[balance]); // 1000n
```

To observe decryption lifecycle, subscribe to SDK events (`DecryptStart`, `DecryptEnd`, `DecryptError`) via the `onEvent` config. Events fire only when the relayer is actually called — the all-zero and fully-cached paths return silently.

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
  const { durationMs, encryptedValues, result } = e.detail;
  console.log(`Decrypted ${encryptedValues.length} value(s) in ${durationMs}ms`);
  // result is Record<EncryptedValue, ClearValue> — look up a specific value
  for (const v of encryptedValues) {
    console.log(`${v} → ${result[v]}`);
  }
});

window.addEventListener(ZamaSDKEvents.DecryptError, (e: CustomEvent<DecryptErrorEvent>) => {
  const { error, durationMs, encryptedValues } = e.detail;
  console.error(
    `Decryption failed after ${durationMs}ms for ${encryptedValues.length} value(s):`,
    error,
  );
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

emitter.on(ZamaSDKEvents.DecryptEnd, ({ durationMs, encryptedValues, result }: DecryptEndEvent) => {
  console.log(`Decrypted ${encryptedValues.length} value(s) in ${durationMs}ms`);
  // result is Record<EncryptedValue, ClearValue> — look up a specific value
  for (const v of encryptedValues) {
    console.log(`${v} → ${result[v]}`);
  }
});

emitter.on(
  ZamaSDKEvents.DecryptError,
  ({ error, durationMs, encryptedValues }: DecryptErrorEvent) => {
    console.error(
      `Decryption failed after ${durationMs}ms for ${encryptedValues.length} value(s):`,
      error,
    );
  },
);
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
This is the SDK-level entry point for user decryption — a single method that takes a list of value/contract **pairs** and decrypts them with the connected wallet's credentials (the Zama glossary splits this into `decryptValue`/`decryptValues`/`decryptValuesFromPairs`; the SDK intentionally exposes just one). It is distinct from `decryptPublicValues` (gateway-level decryption that happens on-chain without user authentication). In React, use [`useDecryptValues`](../react/useDecryptValues.md) which wraps `sdk.decryption.decryptValues` with TanStack Query semantics.
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

### permits.revokePermits

`(contracts?: Address[]) => Promise<void>`

Remove signed permits for the current signer. With a contract list, removes permits on the current chain whose payload touches any listed address. Without arguments, removes all permits across all chains and delegators. The transport key pair is not affected.

```ts
await sdk.permits.revokePermits(["0xTokenA"]); // current chain only
await sdk.permits.revokePermits(); // all permits, all chains
```

### permits.clear

`() => Promise<void>`

Wipe the transport key pair **and** cascade-delete every permit for the current signer. Use for "log out" flows.

```ts
await sdk.permits.clear();
```

### delegations

`sdk.delegations` manages on-chain decryption delegation through the ACL contract:

- `delegateDecryption({ contractAddress, delegateAddress, expirationDate? })`
- `revokeDelegation({ contractAddress, delegateAddress })`
- `isActive({ contractAddress, delegatorAddress, delegateAddress })`
- `getExpiry({ contractAddress, delegatorAddress, delegateAddress })`

See the [Delegations reference](./delegation.md) for the full API and propagation notes.

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

- [Token](./Token.md) — read/write token operations
- [WrappedToken](./WrappedToken.md) — ERC-7984 ERC-20 wrapper operations (shield, unshield, allowance)
- [WrappersRegistry](./WrappersRegistry.md) — on-chain token wrappers registry
- [Configuration guide](../../guides/configuration.md) — relayer, signer, and storage setup
