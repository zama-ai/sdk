---
title: ZamaSDK
description: Entry point for all confidential token operations.
---

# ZamaSDK

Entry point for all confidential token operations — creates tokens, manages sessions, and coordinates the relayer and signer.

## Import

```ts
import { ZamaSDK } from "@zama-fhe/sdk";
```

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { ZamaSDK, indexedDBStorage } from "@zama-fhe/sdk";
import { RelayerWeb, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% tab title="config.ts" %}

```ts
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

const signer = new ViemSigner({ walletClient, publicClient });
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

FHE keypair validity duration in seconds. Default: `86400` (1 day). After expiry, the next decrypt prompts a wallet signature to regenerate the keypair.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  keypairTTL: 604800, // 7 days
});
```

### sessionTTL

`number | undefined`

Session signature lifetime in seconds. Default: `2592000` (30 days). Set to `0` to require a wallet signature on every operation.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  sessionTTL: 3600, // 1 hour
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

### allow

`(...addresses: Address[]) => Promise<void>`

Prompts the wallet to sign and caches session credentials for the given contract addresses. A single signature covers all addresses passed. Call early to avoid popups during balance decrypts.

```ts
await sdk.allow("0xTokenA", "0xTokenB");
```

### revoke

`(...addresses: Address[]) => Promise<void>`

Clears session credentials. The addresses are included in the `credentials:revoked` event.

```ts
await sdk.revoke("0xTokenA", "0xTokenB");
```

### revokeSession

`() => Promise<void>`

Clears the session signature without specifying addresses. The next decrypt requires a fresh wallet signature.

```ts
await sdk.revokeSession();
```

### isAllowed

`() => Promise<boolean>`

Returns whether the session has active credentials.

```ts
const allowed = await sdk.isAllowed();
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
- [Configuration guide](/guides/configuration) — relayer, signer, and storage setup
