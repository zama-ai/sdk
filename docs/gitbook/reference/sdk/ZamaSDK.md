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

::: code-group

```ts [app.ts]
import { ZamaSDK, indexedDBStorage } from "@zama-fhe/sdk";
import { RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

```ts [config.ts]
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

const signer = new ViemSigner({ walletClient, publicClient });
```

:::

## Constructor

### relayer

`RelayerWeb | RelayerNode`

Handles FHE encryption, decryption, and keypair management.

```ts
const sdk = new ZamaSDK({
  relayer, // [!code focus]
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
  signer, // [!code focus]
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
  storage: indexedDBStorage, // [!code focus]
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
  sessionStorage: chromeSessionStorage, // [!code focus]
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
  keypairTTL: 604800, // [!code focus] 7 days
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
  sessionTTL: 3600, // [!code focus] 1 hour
});
```

### onEvent

`((event: SdkEvent) => void) | undefined`

Lifecycle event callback for debugging and telemetry. Events never contain sensitive data.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  onEvent: ({ type, tokenAddress, ...rest }) => {
    // [!code focus]
    console.debug(`[zama] ${type}`, rest); // [!code focus]
  }, // [!code focus]
});
```

## Methods

### createToken

`(address: Address, wrapperAddress?: Address) => Token`

Creates a read/write token instance for shielding, transferring, and unshielding.

```ts
const token = sdk.createToken("0xEncryptedERC20"); // [!code focus]

// When the wrapper differs from the encrypted ERC-20 contract
const token = sdk.createToken("0xTokenAddress", "0xWrapperAddress"); // [!code focus]
```

### createReadonlyToken

`(address: Address) => ReadonlyToken`

Creates a read-only token instance for balance decryption and metadata queries.

```ts
const readonlyToken = sdk.createReadonlyToken("0xEncryptedERC20"); // [!code focus]
```

### allow

`(...addresses: Address[]) => Promise<void>`

Prompts the wallet to sign and caches session credentials for the given contract addresses. A single signature covers all addresses passed. Call early to avoid popups during balance decrypts.

```ts
await sdk.allow("0xTokenA", "0xTokenB"); // [!code focus]
```

### revoke

`(...addresses: Address[]) => Promise<void>`

Clears session credentials. The addresses are included in the `credentials:revoked` event.

```ts
await sdk.revoke("0xTokenA", "0xTokenB"); // [!code focus]
```

### revokeSession

`() => Promise<void>`

Clears the session signature without specifying addresses. The next decrypt requires a fresh wallet signature.

```ts
await sdk.revokeSession(); // [!code focus]
```

### isAllowed

`() => Promise<boolean>`

Returns whether the session has active credentials.

```ts
const allowed = await sdk.isAllowed(); // [!code focus]
```

### terminate

`() => void`

Cleans up the Web Worker (browser) or thread pool (Node.js). Call when the SDK is no longer needed.

```ts
sdk.terminate(); // [!code focus]
```

## Related

- [Token](/reference/sdk/Token) — read/write token operations
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — read-only token operations
- [Configuration guide](/guides/configuration) — relayer, signer, and storage setup
