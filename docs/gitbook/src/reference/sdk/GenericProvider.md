---
title: GenericProvider
description: Interface that all provider adapters must implement for chain reads and unsigned transaction preparation.
---

# GenericProvider

Interface that all provider adapters must implement for chain reads and unsigned transaction preparation. You only need this if you are building a custom provider -- otherwise use [ViemProvider](./ViemProvider.md), [EthersProvider](./EthersProvider.md), or the wagmi `createConfig` which builds one internally.

## Import

```ts
import type { GenericProvider } from "@zama-fhe/sdk";
```

## Definition

```ts
interface GenericProvider {
  getChainId(): Promise<number>;
  readContract(config: ReadContractConfig): Promise<unknown>;
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
  getBlockTimestamp(): Promise<bigint>;
  prepareTransaction(args: {
    from: Address;
    calldata: WriteContractConfig;
    nonce?: number;
    gasLimit?: bigint;
    fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  }): Promise<Hex>;
}
```

## Usage with `createConfig`

Pass a custom provider to the generic `createConfig` from `@zama-fhe/sdk`:

```ts
import { createConfig, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  provider: myCustomProvider,
  storage: memoryStorage,
  relayers: { [sepolia.id]: node() },
});
const sdk = new ZamaSDK(config);
```

## Implementing a custom provider

```ts
import type { GenericProvider } from "@zama-fhe/sdk";

class MyProvider implements GenericProvider {
  async getChainId() {
    /* ... */
  }
  async readContract(config) {
    /* ... */
  }
  async waitForTransactionReceipt(hash) {
    /* ... */
  }
  async getBlockTimestamp() {
    /* ... */
  }
  async prepareTransaction(args) {
    /* ... */
  }
}
```

## Methods

### getChainId

```ts
getChainId(): Promise<number>
```

Return the chain ID this provider is connected to.

### readContract

```ts
readContract(config: ReadContractConfig): Promise<unknown>
```

Execute a read-only contract call. `ReadContractConfig` contains `address`, `abi`, `functionName`, and `args`.

### waitForTransactionReceipt

```ts
waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>
```

Poll for a transaction receipt by hash.

### getBlockTimestamp

```ts
getBlockTimestamp(): Promise<bigint>
```

Return the timestamp of the latest block.

### prepareTransaction

```ts
prepareTransaction(args: {
  from: Address;
  calldata: WriteContractConfig;
  nonce?: number;
  gasLimit?: bigint;
  fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
}): Promise<Hex>
```

Build a fully populated, RLP-encoded unsigned EIP-1559 transaction without signing or broadcasting it. The provider reads the chain ID and fills any omitted nonce, gas limit, or fee values from chain state.

## Related

- [ViemProvider](./ViemProvider.md) -- viem implementation
- [EthersProvider](./EthersProvider.md) -- ethers implementation
- [GenericSigner](./GenericSigner.md) -- wallet authority interface
- [Configuration guide](../../guides/configuration.md) -- full setup walkthrough
