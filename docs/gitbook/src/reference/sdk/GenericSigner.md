---
title: GenericSigner
description: Interface that all signer adapters must implement for the SDK to interact with wallets.
---

# GenericSigner

Interface that all signer adapters must implement for the SDK to interact with wallets. You only need this if you are building a custom signer -- otherwise use [ViemSigner](/reference/sdk/ViemSigner), [EthersSigner](/reference/sdk/EthersSigner), or [WagmiSigner](/reference/sdk/WagmiSigner).

## Import

```ts
import type { GenericSigner } from "@zama-fhe/sdk";
```

## Definition

```ts
interface GenericSigner {
  getChainId(): Promise<number>;
  getAddress(): Promise<Address>;
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  writeContract(config: WriteContractConfig): Promise<Hex>;
  subscribe?(onIdentityChange: SignerIdentityListener): () => void;
}
```

{% hint style="info" %}
For read operations (`readContract`, `waitForTransactionReceipt`), see [GenericProvider](/reference/sdk/GenericProvider).
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
  relayers: { [sepolia.id]: node({ poolSize: 4 }) },
});
const sdk = new ZamaSDK(config);
```

## Implementing a custom signer

```ts
import type { GenericSigner } from "@zama-fhe/sdk";

class MySigner implements GenericSigner {
  async getChainId() {
    /* ... */
  }
  async getAddress() {
    /* ... */
  }
  async signTypedData(typedData) {
    /* ... */
  }
  async writeContract(config) {
    /* ... */
  }
}
```

## Methods

### getChainId

```ts
getChainId(): Promise<number>
```

Return the currently connected chain ID.

### getAddress

```ts
getAddress(): Promise<Address>
```

Return the connected wallet address. Read-only signers should throw here.

### signTypedData

```ts
signTypedData(typedData: EIP712TypedData): Promise<Hex>
```

Sign an EIP-712 typed data payload and return the signature. The SDK uses this to create FHE keypair authorization signatures and session signatures.

### writeContract

```ts
writeContract(config: WriteContractConfig): Promise<Hex>
```

Submit a contract write transaction and return the transaction hash. `WriteContractConfig` contains `address`, `abi`, `functionName`, `args`, and optionally `value` and `gas`.

### subscribe (optional)

```ts
subscribe?(onIdentityChange: SignerIdentityListener): () => void
```

Subscribe to wallet identity transitions (connect, disconnect, account change, chain change). Returns an unsubscribe function.

The SDK calls `subscribe()` during initialization if it exists. The listener receives a transition object:

- `previous` -- the previous `{ address, chainId }` identity, when one was known.
- `next` -- the next `{ address, chainId }` identity, when the wallet is connected.

When `previous` is present, the SDK revokes that previous identity's session signature and clears that requester's decrypt cache.

{% hint style="info" %}
Implementing `subscribe()` is optional but recommended. Without it, stale sessions persist until TTL expiry, which can create confusing UX when users switch accounts. See [`WagmiSigner`](https://github.com/zama-ai/token-sdk/blob/main/packages/react-sdk/src/wagmi/wagmi-signer.ts) for a reference implementation.
{% endhint %}

## Related

- [ViemSigner](/reference/sdk/ViemSigner) -- viem implementation
- [EthersSigner](/reference/sdk/EthersSigner) -- ethers implementation
- [WagmiSigner](/reference/sdk/WagmiSigner) -- wagmi implementation with auto-revoke
- [Configuration guide](/guides/configuration) -- full setup walkthrough
