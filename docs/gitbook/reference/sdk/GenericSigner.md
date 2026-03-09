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
  writeContract(config: ContractCallConfig): Promise<Hex>;
  readContract(config: ContractCallConfig): Promise<unknown>;
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
  subscribe?(callbacks: SignerLifecycleCallbacks): () => void;
}
```

## Usage

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
  async readContract(config) {
    /* ... */
  }
  async waitForTransactionReceipt(hash) {
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
writeContract(config: ContractCallConfig): Promise<Hex>
```

Submit a contract write transaction and return the transaction hash. `ContractCallConfig` contains `address`, `abi`, `functionName`, and `args`.

### readContract

```ts
readContract(config: ContractCallConfig): Promise<unknown>
```

Perform a read-only contract call and return the result. Must work in all modes, including read-only signers.

### waitForTransactionReceipt

```ts
waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>
```

Wait for a transaction to be mined and return the receipt.

### subscribe (optional)

```ts
subscribe?(callbacks: SignerLifecycleCallbacks): () => void
```

Subscribe to wallet lifecycle events (disconnect, account change). Returns an unsubscribe function.

The SDK calls `subscribe()` during initialization if it exists. The callbacks object contains:

- `onDisconnect()` -- called when the wallet disconnects or locks. The SDK revokes the session.
- `onAccountChange()` -- called when the user switches accounts. The SDK revokes the previous account's session.

::: tip
Implementing `subscribe()` is optional but recommended. Without it, stale sessions persist until TTL expiry, which can create confusing UX when users switch accounts. See [`WagmiSigner`](https://github.com/zama-ai/token-sdk/blob/main/packages/react-sdk/src/wagmi/wagmi-signer.ts) for a reference implementation.
:::

## Related

- [ViemSigner](/reference/sdk/ViemSigner) -- viem implementation
- [EthersSigner](/reference/sdk/EthersSigner) -- ethers implementation
- [WagmiSigner](/reference/sdk/WagmiSigner) -- wagmi implementation with auto-revoke
- [Configuration guide](/guides/configuration) -- full setup walkthrough
