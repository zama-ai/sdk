# @zama-fhe/sdk

Core TypeScript SDK for building confidential dApps and backend integrations on the Zama Protocol. Use this package for browser or Node.js code outside React when you need confidential balances, shielding, unshielding, or private transfers.

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

Optional peer dependencies depend on the adapter you use:

| Package                | Version | Use when...                    |
| ---------------------- | ------- | ------------------------------ |
| `@tanstack/query-core` | `>= 5`  | You use `@zama-fhe/sdk/query`  |
| `viem`                 | `>= 2`  | You use `@zama-fhe/sdk/viem`   |
| `ethers`               | `>= 6`  | You use `@zama-fhe/sdk/ethers` |

`@zama-fhe/sdk/node` is ESM-only because it relies on `node:worker_threads`.

## Minimal example

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum!) });

const chain = {
  ...sepoliaFhe,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [chain],
  publicClient,
  walletClient,
  relayers: { [chain.id]: web() },
});

const sdk = new ZamaSDK(config);
const token = sdk.createToken("0xYourEncryptedERC20");

const balance = await token.balanceOf();
await token.confidentialTransfer("0xRecipient", 100n);
```

Browser apps should proxy relayer requests through their backend so the relayer API key stays server-side. See the [Authentication guide](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/authentication.md).

## What this package includes

- `ZamaSDK` is the main entry point. It creates token instances, manages sessions, and coordinates the signer, relayer, and storage layers.
- `Token` exposes read/write confidential token operations such as shield, confidential transfer, unwrap, and unshield.
- `ReadonlyToken` exposes read-only token access such as metadata, total supply, and balance decryption.
- Adapter-specific `createConfig` helpers are available from `@zama-fhe/sdk/viem` and `@zama-fhe/sdk/ethers`.
- Relayer factories are split by runtime: browser `web()` comes from `@zama-fhe/sdk/web`, Node.js `node()` comes from `@zama-fhe/sdk/node`, and local `cleartext()` comes from `@zama-fhe/sdk`.
- Chain presets such as `sepolia`, `mainnet`, `hoodi`, `hardhat`, and `anvil` are available from `@zama-fhe/sdk/chains`.

## Documentation

- [Official documentation](https://docs.zama.org/protocol) is the best starting point for the hosted SDK docs.
- [Overview](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/README.md) explains what the SDK covers and how the documentation is organized.
- [Quick start](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/tutorials/quick-start.md) gets from installation to a working confidential transfer.
- [Guides](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/guides/README.md) cover focused topics such as authentication, configuration, balances, transfers, and unshielding.
- [SDK reference](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/sdk/README.md) documents the full core API, including `ZamaSDK`, `Token`, `ReadonlyToken`, adapters, and helpers.
- [React SDK docs](https://github.com/zama-ai/sdk/blob/main/docs/gitbook/src/reference/react/README.md) cover the provider and hook layer for React apps.

## Support

- [Community forum](https://community.zama.ai/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
