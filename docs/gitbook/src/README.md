---
description: TypeScript SDK for confidential smart contracts — shield, transfer, and unshield tokens with Fully Homomorphic Encryption.
---

# Overview

**Welcome to the Zama SDK!**

TypeScript SDK for building confidential dApps with FHEVM — shield, transfer, and unshield tokens using Fully Homomorphic Encryption (FHE).

## Where to go next

If you're new to the Zama Protocol, start with the [Litepaper](https://docs.zama.ai/protocol/zama-protocol-litepaper) or the [Protocol Overview](https://docs.zama.ai/protocol) to understand the foundations.

Otherwise:

🟨 Go to [**Quick start**](tutorials/quick-start.md) to get from zero to a working confidential transfer in under 5 minutes.

🟨 Go to [**Build your first confidential dApp**](tutorials/first-confidential-dapp.md) for an end-to-end React tutorial.

🟨 Go to [**Guides**](guides/README.md) for step-by-step instructions on shielding, transfers, balances, and more.

🟨 Go to [**SDK reference**](reference/sdk/README.md) for the full core SDK API.

🟨 Go to [**React reference**](reference/react/README.md) for all React hooks and components.

## Features

### Shield & unshield

Convert public ERC-20 tokens into encrypted form and back. The SDK handles approvals, encryption, and the two-step unshield flow.

### Confidential transfers

Encrypt amounts client-side before submitting on-chain. On-chain observers see the transaction but never the value.

### React hooks

TanStack Query-based hooks with cached decryption, automatic cache invalidation, and one-signature session management.

## Two packages, one import

| Package                                                | Use when...                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`@zama-fhe/sdk`](/reference/sdk/ZamaSDK)              | You are building with vanilla TypeScript, Node.js, or any non-React framework |
| [`@zama-fhe/react-sdk`](/reference/react/ZamaProvider) | You are building a React app (hooks and React-specific providers)             |

If you are using React, install both packages: `@zama-fhe/react-sdk` provides the hooks and `ZamaProvider`, while `@zama-fhe/sdk` is a peer dependency that provides core utilities, relayer factories, chain presets, and error helpers. Adapter-specific `createConfig` functions are imported from sub-paths (e.g. `@zama-fhe/react-sdk/wagmi`, `@zama-fhe/sdk/viem`, `@zama-fhe/sdk/ethers`).

## Install

{% tabs %}
{% tab title="pnpm" %}

```sh
# React app
pnpm add @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
pnpm add @zama-fhe/sdk
```

{% endtab %}
{% tab title="npm" %}

```sh
# React app
npm install @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
npm install @zama-fhe/sdk
```

{% endtab %}
{% tab title="yarn" %}

```sh
# React app
yarn add @zama-fhe/react-sdk @zama-fhe/sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
yarn add @zama-fhe/sdk
```

{% endtab %}
{% endtabs %}

## Your first confidential transfer in 30 seconds

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum!) });

const mySepolia = {
  ...sepoliaFhe,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  relayers: { [mySepolia.id]: web() },
});

const sdk = new ZamaSDK(config);
const token = sdk.createToken("0xYourEncryptedERC20");

await token.shield(1000n); // deposit public tokens
const balance = await token.balanceOf(); // decrypt your balance
await token.confidentialTransfer("0xRecipient", 500n); // private send
await token.unshield(500n); // withdraw back to public
```

Ready to build? Jump to the [Quick start](/tutorials/quick-start) for a full working example with your stack.

## Help center

Ask technical questions and discuss with the community.

- [Community forum](https://community.zama.ai/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
