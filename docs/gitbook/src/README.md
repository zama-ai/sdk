---
description: TypeScript SDK for confidential ERC-20 tokens — shield, transfer, and unshield with Fully Homomorphic Encryption.
---

# Zama SDK

Integrate the Zama fhEVM into your app

TypeScript SDK for confidential ERC-20 tokens — shield, transfer, and unshield with Fully Homomorphic Encryption.

## Features

### Shield & Unshield

Convert public ERC-20 tokens into encrypted form and back. The SDK handles approvals, encryption, and the two-step unshield flow.

### Confidential Transfers

Encrypt amounts client-side before submitting on-chain. On-chain observers see the transaction but never the value.

### React Hooks

TanStack Query-based hooks with two-phase polling, automatic cache invalidation, and one-signature session management.

## Two packages, one import

| Package                                                | Use when...                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`@zama-fhe/sdk`](/reference/sdk/ZamaSDK)              | You are building with vanilla TypeScript, Node.js, or any non-React framework |
| [`@zama-fhe/react-sdk`](/reference/react/ZamaProvider) | You are building a React app (includes everything from the core SDK)          |

If you are using React, `@zama-fhe/react-sdk` re-exports most of the core SDK (hooks, providers, `RelayerWeb`, storage singletons). You still import signer adapters from their sub-paths (e.g. `@zama-fhe/sdk/viem`, `@zama-fhe/sdk/ethers`).

## Install

{% tabs %}
{% tab title="pnpm" %}

```sh
# React app
pnpm add @zama-fhe/react-sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
pnpm add @zama-fhe/sdk
```

{% endtab %}
{% tab title="npm" %}

```sh
# React app
npm install @zama-fhe/react-sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
npm install @zama-fhe/sdk
```

{% endtab %}
{% tab title="yarn" %}

```sh
# React app
yarn add @zama-fhe/react-sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
yarn add @zama-fhe/sdk
```

{% endtab %}
{% endtabs %}

## Your first confidential transfer in 30 seconds

```ts
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [1]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer: new ViemSigner({ walletClient, publicClient }),
  storage: indexedDBStorage,
});

const token = sdk.createToken("0xYourEncryptedERC20");

await token.shield(1000n); // deposit public tokens
const balance = await token.balanceOf(); // decrypt your balance
await token.confidentialTransfer("0xRecipient", 500n); // private send
await token.unshield(500n); // withdraw back to public
```

Ready to build? Jump to the [Quick Start](/tutorials/quick-start) for a full working example with your stack.
