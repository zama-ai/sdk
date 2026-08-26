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

### permits.registerPermit

`(prepared: PreparedPermit, signature: Hex) => Promise<void>`

Verify and persist the signature an out-of-process signer produced for an [`offline.preparePermit`](#offline-preparepermit) payload — the second phase of the offline permit flow. No wallet account required: the permit is scoped by `prepared.signerAddress` and, for a delegated permit, the delegator address embedded in the signature-verified `eip712` — not a connected signer. Idempotent: registering the same `(prepared, signature)` pair more than once (e.g. a retried webhook delivery) replaces the stored entry instead of duplicating it.

```ts
const prepared = await sdk.offline.preparePermit({ signer: custodyAddress, contracts: [cUSDT] });
const signature = await custody.signTypedData(prepared.eip712);
await sdk.permits.registerPermit(prepared, signature);
```

**Throws:**

- `ConfigurationError` - `prepared` doesn't match the `PreparedPermit` shape (e.g. it crossed a process boundary and was corrupted)
- `PreparedPermitChainMismatchError` - the chain embedded in `prepared.eip712` doesn't match the currently active chain
- `PreparedPermitExpiredError` - the permit's validity window has already elapsed
- `TransportKeyPairChangedError` - no transport key pair is stored for `prepared.signerAddress`, or it no longer matches the public key `prepared.eip712` was built against (e.g. a TTL expiry or eviction in between); call `preparePermit` again
- `SigningFailedError` - the signature is invalid or malformed

See the [Offline reference](./Offline.md#preparepermit) for `preparePermit`'s request/response shape and the [Offline signing guide](../../guides/offline.md#offline-permits) for the full workflow.

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

### permits.warmTransportKeyPair

`() => Promise<void>`

Best-effort transport key pair prefetch for the connected signer — an optional latency optimization. Decrypt and permit flows remain correct without it, since they lazily create the transport key pair when needed. Silently no-ops when no signer is configured or no wallet account is connected yet.

```ts
await sdk.permits.warmTransportKeyPair();
```

Not for pre-warming a shared `transportKeyPairScope` — this method's wallet-account precondition doesn't apply to a scope-wide key, and would silently no-op exactly when an operator is most likely calling it (no end-user connected yet). Use [`permits.warmTransportKeyPairScope`](#permits-warmtransportkeypairscope) instead.

### permits.warmTransportKeyPairScope

`(scopeId: string) => Promise<void>`

Pre-warm the shared transport key pair for a [`transportKeyPairScope`](../../concepts/security-model.md#shared-tenant-scope-b2b2c-waas-operators). Storage-only, operator-level action — no wallet account or signer needs to be connected, unlike `permits.warmTransportKeyPair()`.

```ts
await sdk.permits.warmTransportKeyPairScope("tenant-123");
```

`scopeId` must match the configured `transportKeyPairScope`, guarding against warming the wrong scope by mistake; throws `ConfigurationError` otherwise.

### permits.revokeTransportKeyPair

`(scopeId: string) => Promise<void>`

Revoke the shared transport key pair for a `transportKeyPairScope` — the operator-level counterpart to [`permits.warmTransportKeyPairScope`](#permits-warmtransportkeypairscope), for use on suspected key compromise. Deletes the shared key pair; every permit in the scope embeds its public key, so they're all treated as stale on next access.

```ts
await sdk.permits.revokeTransportKeyPair("tenant-123");
```

This does not revoke any permit already issued under the key — a permit is a self-contained, bearer-style EIP-712 signature the relayer accepts independently of this call, and one exfiltrated alongside the key remains usable until its own `permitTTL` expiry regardless of this call. `scopeId` must match the configured scope; throws `ConfigurationError` otherwise. Signer-level [`permits.clear`](#permits-clear) never touches the shared key pair — it only ever wipes the calling signer's own permits.

### delegations

`sdk.delegations` manages on-chain decryption delegation through the ACL contract:

- `delegateDecryption({ contractAddress, delegateAddress, expirationDate? })`
- `revokeDelegation({ contractAddress, delegateAddress })`
- `isActive({ contractAddress, delegatorAddress, delegateAddress })`
- `getExpiry({ contractAddress, delegatorAddress, delegateAddress })`

See the [Delegations reference](./delegation.md) for the full API and propagation notes.

### offline.prepare

`sdk.offline.prepare(request, options?)`

Builds an unsigned transaction that the caller signs and broadcasts out-of-process (institutional custody, HSMs). Works without a configured signer.

See the [Offline reference](./Offline.md) for the request kinds and options, and the [Offline signing guide](../../guides/offline.md) for the workflow.

### offline.preparePermit

`sdk.offline.preparePermit(request)`

Builds the unsigned EIP-712 typed data for a decryption permit, without signing it — the offline counterpart to [`permits.grantPermit`](#permits-grantpermit). Hand the result to an out-of-process signer, then pass the returned signature to [`permits.registerPermit`](#permits-registerpermit). Works without a configured signer.

See the [Offline reference](./Offline.md#preparepermit) for the request/response shape and typed errors, and the [Offline signing guide](../../guides/offline.md#offline-permits) for the workflow.

### dispose

`() => void`

Unsubscribes from signer lifecycle events (disconnect, account change, chain change) without terminating the relayer. Use when you want to stop reacting to wallet events but keep the relayer alive for other SDK instances.

```ts
sdk.dispose();
```

### terminate

`() => void`

Full cleanup — calls `dispose()` and disposes the signer adapter's own event subscriptions. Call when the SDK is no longer needed.

```ts
sdk.terminate();
```

## Related

- [Token](./Token.md) — read/write token operations
- [WrappedToken](./WrappedToken.md) — ERC-7984 ERC-20 wrapper operations (shield, unshield, allowance)
- [WrappersRegistry](./WrappersRegistry.md) — on-chain token wrappers registry
- [Configuration guide](../../guides/configuration.md) — relayer, signer, and storage setup
