# @zama-fhe/sdk

Core TypeScript SDK for building confidential dApps and backend integrations on the Zama Protocol. Use this package for browser or Node.js code outside React when you need confidential smart contract operations such as authorization, encryption, balances, transfers, shielding, and unshielding.

If you are building a React app, pair this package with `@zama-fhe/react-sdk`.

## Installation

```bash
pnpm add @zama-fhe/sdk
# or
npm install @zama-fhe/sdk
# or
yarn add @zama-fhe/sdk
```

If you follow the viem example below, install `viem` too:

```bash
pnpm add @zama-fhe/sdk viem
```

Other optional peers depend on the adapter you use: `ethers` for `@zama-fhe/sdk/ethers` and `@tanstack/query-core` for `@zama-fhe/sdk/query`.

`@zama-fhe/sdk/node` is ESM-only because it relies on `node:worker_threads`.

## Minimal example

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const rpcUrl = "https://sepolia.infura.io/v3/YOUR_KEY";
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum!) });

const chain = {
  ...sepoliaFhe,
  network: rpcUrl,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [chain],
  publicClient,
  walletClient,
  relayers: { [chain.id]: web() },
});

const sdk = new ZamaSDK(config);
const token = sdk.tokens.confidential("0xYourConfidentialToken");

const balance = await token.balanceOf();
await token.confidentialTransfer("0xRecipient", 100n);
```

Browser apps should proxy relayer requests through their backend so the relayer API key stays server-side. See the [Authentication guide](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/authentication.md).

## What this package includes

- `ZamaSDK` is the main entry point. It creates token instances, manages sessions, and coordinates the signer, relayer, and storage layers.
- `Token` exposes the base ERC-7984 confidential token operations: balance reads (decryption), confidential transfers, operator approvals, and delegated decryption.
- `WrappedToken` extends `Token` with ERC-7984 ERC-20 wrapper operations: shield, unshield, allowance, and unwrap orchestration.
- Adapter-specific `createConfig` helpers are available from `@zama-fhe/sdk/viem` and `@zama-fhe/sdk/ethers`.
- Relayer factories are split by runtime: browser `web()` comes from `@zama-fhe/sdk/web`, Node.js `node()` comes from `@zama-fhe/sdk/node`, and local `cleartext()` comes from `@zama-fhe/sdk`.
- Chain presets such as `sepolia`, `mainnet`, `hoodi`, `hardhat`, and `anvil` are available from `@zama-fhe/sdk/chains`.

## Documentation

- [Official documentation](https://docs.zama.org/protocol) is the best starting point for the hosted SDK docs.
- [Quick start](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/quick-start.md) gets from installation to a working confidential transfer.
- [Guides](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/README.md) cover focused topics such as authentication, configuration, balances, transfers, and unshielding.
- [SDK reference](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/sdk/README.md) documents the full core API, including `ZamaSDK`, `Token`, `WrappedToken`, adapters, and helpers.
- [React SDK docs](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/react/README.md) cover the provider and hook layer for React apps.
