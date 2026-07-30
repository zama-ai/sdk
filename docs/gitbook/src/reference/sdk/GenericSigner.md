---
title: GenericSigner
description: Interface that all signer adapters must implement for the SDK to interact with wallets.
---

# GenericSigner

Interface that all signer adapters must implement for the SDK to interact with wallets. You only need this if you are building a custom signer -- otherwise use [ViemSigner](./ViemSigner.md) or [EthersSigner](./EthersSigner.md).

## Import

```ts
import type { GenericSigner } from "@zama-fhe/sdk";
```

## Definition

```ts
interface GenericSigner {
  readonly walletAccount: WalletAccountStore;
  requireWalletAccount(operation: string): WalletAccount;
  refreshWalletAccount?(): Promise<WalletAccount | undefined>;
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  writeContract(config: WriteContractConfig): Promise<Hex>;
  dispose?(): void;
}

interface WalletAccountStore {
  getSnapshot(): WalletAccount | undefined;
  subscribe(onWalletAccountChange: WalletAccountListener): () => void;
}
```

{% hint style="info" %}
For read operations (`readContract`, `waitForTransactionReceipt`), see [GenericProvider](./GenericProvider.md).
{% endhint %}

## Usage with `createConfig`

Pass a custom signer and provider to the generic `createConfig` from `@zama-fhe/sdk`:

```ts
import { createConfig, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  signer: mySigner,
  provider: myProvider,
  storage: memoryStorage,
  relayers: { [sepolia.id]: node() },
});
const sdk = new ZamaSDK(config);
```

## Implementing a custom signer

```ts
import { BaseSigner } from "@zama-fhe/sdk";

class MySigner extends BaseSigner {
  #unsubscribe: () => void;

  constructor(provider: MyProvider) {
    super(provider.currentAccount());
    this.#unsubscribe = provider.on("change", (account) => {
      this.walletAccount.setSnapshot(account);
    });
  }

  async signTypedData(typedData) {
    /* ... */
  }

  async writeContract(config) {
    /* ... */
  }

  protected override onDispose() {
    this.#unsubscribe();
  }
}
```

{% hint style="info" %}
`BaseSigner` provides `walletAccount` (a `MutableWalletAccountStore`), `requireWalletAccount`, idempotent `dispose` / `[Symbol.dispose]`, so subclasses only need to implement `signTypedData`, `writeContract`, and optionally `onDispose` for cleanup. Pass the initial wallet account snapshot to `super()`.

If your adapter resolves its initial account asynchronously (e.g. an ethers `Signer` wrapping a JSON-RPC provider), override `refreshWalletAccount(): Promise<WalletAccount | undefined>` so action paths can await non-prompting discovery before throwing `WalletNotConnectedError`.

Using `BaseSigner` is optional — implementing the `GenericSigner` interface directly with `createWalletAccountStore()` remains fully supported.
{% endhint %}

## Methods

### walletAccount

```ts
walletAccount: WalletAccountStore;
```

Synchronous observable store for wallet account readiness. React integrations use this store to avoid SSR and hydration races.

Direct store subscriptions observe raw signer transitions. For SDK-coordinated cleanup and query invalidation, subscribe through the SDK lifecycle instead so credential and CachingService cleanup runs first.

### requireWalletAccount

```ts
requireWalletAccount(operation: string): WalletAccount
```

Return the current `{ address, chainId }` snapshot or throw `WalletNotConnectedError`. This method must not prompt the wallet.

### refreshWalletAccount (optional)

```ts
refreshWalletAccount?(): Promise<WalletAccount | undefined>
```

Optional non-prompting discovery hook for adapters whose initial account snapshot is only available asynchronously.

### dispose (optional)

```ts
dispose?(): void
```

Release adapter-owned wallet watchers or provider event listeners. `ZamaSDK.terminate()` calls this when present.

### signTypedData

```ts
signTypedData(typedData: EIP712TypedData): Promise<Hex>
```

Sign an EIP-712 typed data payload and return the signature. The SDK uses this to sign FHE decrypt permits.

### writeContract

```ts
writeContract(config: WriteContractConfig): Promise<Hex>
```

Submit a contract write transaction and return the transaction hash. `WriteContractConfig` contains `address`, `abi`, `functionName`, `args`, and optionally `value` and `gas`.

### walletAccount.subscribe

```ts
walletAccount.subscribe(onWalletAccountChange: WalletAccountListener): () => void
```

Subscribe to wallet identity transitions (connect, disconnect, account change, chain change). Returns an unsubscribe function.

The SDK calls `walletAccount.subscribe()` during initialization. The listener receives a transition object:

- `previous` -- the previous `{ address, chainId }` identity, when one was known.
- `next` -- the next `{ address, chainId }` identity, when the wallet is connected.

When `previous` is present, the SDK clears that previous account's transport key pair, permits, and decrypt cache.

## Related

- [GenericProvider](./GenericProvider.md) -- read-only chain access interface
- [ViemSigner](./ViemSigner.md) -- viem implementation
- [EthersSigner](./EthersSigner.md) -- ethers implementation
- [Configuration guide](../../guides/configuration.md) -- full setup walkthrough
