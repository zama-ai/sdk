# Zama SDK

Add private token balances and transfers to your dApp. Users can shield ERC-20 tokens so their balances and transfer amounts are encrypted on-chain using [Fully Homomorphic Encryption](https://www.zama.ai/fhevm) — nobody can see how much they hold or send.

## What you can build

- **Private balances** — users shield public ERC-20 tokens into encrypted form, and unshield them back when needed
- **Confidential transfers** — send tokens without revealing the amount on-chain
- **Activity feeds** — parse on-chain events and decrypt amounts for the user's own UI

## Two packages, one import

| Package                                               | Use when...                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`@zama-fhe/sdk`](guides/sdk/overview.md)             | You're building with vanilla TypeScript, Node.js, or any non-React framework |
| [`@zama-fhe/react-sdk`](guides/react-sdk/overview.md) | You're building a React app (includes everything from the core SDK)          |

If you're using React, you only need `@zama-fhe/react-sdk` — it re-exports everything from the core SDK, so you never import from both.

## Install

```bash
# React app
pnpm add @zama-fhe/react-sdk @tanstack/react-query

# Vanilla TypeScript / Node.js
pnpm add @zama-fhe/sdk
```

## Your first confidential transfer in 30 seconds

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer",
        network: YOUR_RPC_URL,
      },
    },
  }),
  signer: new ViemSigner({ walletClient, publicClient }),
  storage: new IndexedDBStorage(),
});

const token = sdk.createToken("0xYourEncryptedERC20");

await token.shield(1000n); // deposit public tokens
const balance = await token.balanceOf(); // decrypt your balance
await token.confidentialTransfer("0xRecipient", 500n); // private send
await token.unshield(500n); // withdraw back to public
```

Ready? Jump to the [Quick Start](guides/quick-start.md) for a full working example with your stack.
