---
title: Network presets
description: Pre-configured chain objects and legacy network configs for supported networks.
---

# Network presets

## Chain objects (recommended)

Import pre-configured chain objects from `@zama-fhe/sdk/chains`. Each chain includes contract addresses, relayer URLs, chain IDs, and an `id` alias for use in relayer config keys.

```ts
import { sepolia, mainnet, hoodi, hardhat } from "@zama-fhe/sdk/chains";
```

### Available chains

| Chain     | Chain ID   | Network            |
| --------- | ---------- | ------------------ |
| `mainnet` | `1`        | Ethereum Mainnet   |
| `sepolia` | `11155111` | Sepolia Testnet    |
| `hoodi`   | `560048`   | Hoodi Testnet      |
| `hardhat` | `31337`    | Local Hardhat node |

### What each chain includes

Each chain object implements the `FheChain` interface:

| Field                                       | Type                  | Description                                                                                              |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                        | `number`              | Chain identifier                                                                                         |
| `gatewayChainId`                            | `number`              | Chain ID of the gateway                                                                                  |
| `relayerUrl`                                | `string`              | Default relayer endpoint for this network                                                                |
| `network`                                   | `string`              | Default RPC URL for this network                                                                         |
| `aclContractAddress`                        | `Address`             | ACL contract address                                                                                     |
| `kmsContractAddress`                        | `Address`             | KMS contract address                                                                                     |
| `inputVerifierContractAddress`              | `Address`             | Input verifier contract address                                                                          |
| `verifyingContractAddressDecryption`        | `Address`             | EIP-712 verifying contract for decrypt operations                                                        |
| `verifyingContractAddressInputVerification` | `Address`             | EIP-712 verifying contract for encrypt operations                                                        |
| `registryAddress`                           | `string \| undefined` | Token wrapper registry contract address (undefined for chains without a deployed registry, e.g. Hardhat) |

### Usage with `createConfig`

Pass chain objects in the `chains` array and use `chain.id` as relayer keys:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk";
import { sepolia, mainnet } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia, mainnet],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: web(),
    [mainnet.id]: web(),
  },
});
```

Per-chain overrides (e.g. `relayerUrl`, `network`) are set by spreading the chain preset in the `chains` array. The chain object provides all contract addresses automatically.

### Browser apps

In browser environments, proxy relayer requests through your backend to avoid exposing API keys. Override `relayerUrl` in the chain definition:

```ts
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;
```

### Server apps

On the server, use `node()` with pool options. Chain data (network, relayerUrl) comes from the preset:

```ts
import { node } from "@zama-fhe/sdk/node";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
} as const satisfies FheChain;
// Then in createConfig: relayers: { [mySepolia.id]: node({ poolSize: 4 }) }
```

### Local development

Use the `hardhat` chain with a `cleartext()` relayer:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { cleartext } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [hardhat],
  publicClient,
  walletClient,
  relayers: {
    [hardhat.id]: cleartext(),
  },
});
```

### Multiple networks

Support multiple networks by listing them in the `chains` array:

```ts
import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = { ...sepolia, relayerUrl: "/api/relayer/11155111" } as const satisfies FheChain;
const myMainnet = { ...mainnet, relayerUrl: "/api/relayer/1" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia, myMainnet],
  wagmiConfig,
  relayers: {
    [mySepolia.id]: web(),
    [myMainnet.id]: web(),
  },
});
```

## Legacy preset configs

The legacy `SepoliaConfig`, `MainnetConfig`, and `HardhatConfig` objects are still available for use with manual `RelayerWeb`/`RelayerNode` construction:

```ts
import { MainnetConfig, SepoliaConfig, HardhatConfig } from "@zama-fhe/sdk";
```

| Preset          | Chain ID   | Network            |
| --------------- | ---------- | ------------------ |
| `MainnetConfig` | `1`        | Ethereum Mainnet   |
| `SepoliaConfig` | `11155111` | Sepolia Testnet    |
| `HardhatConfig` | `31337`    | Local Hardhat node |

{% hint style="info" %}
For new projects, prefer chain objects from `@zama-fhe/sdk/chains` with `createConfig`. The legacy preset configs work best with the manual `RelayerWeb`/`RelayerNode` constructors.
{% endhint %}

## DefaultRegistryAddresses

A convenience export of built-in registry addresses for known chains (Mainnet, Sepolia, Hoodi) as a `Record<number, Address>` map. Used internally by the [WrappersRegistry](/reference/sdk/WrappersRegistry) class.

```ts
import { DefaultRegistryAddresses } from "@zama-fhe/sdk";

// { 1: "0xeb5015fF...", 11155111: "0xDEbdfa25..." }
console.log(DefaultRegistryAddresses);
```

{% hint style="info" %}
`hardhat` has no registry address by default. Pass one explicitly via `registryAddresses` when creating a [WrappersRegistry](/reference/sdk/WrappersRegistry).
{% endhint %}

## Related

- [WrappersRegistry](/reference/sdk/WrappersRegistry) — high-level registry query API
- [Configuration guide](/guides/configuration) — full chains, relayers, signer, and storage setup
- [ZamaSDK](/reference/sdk/ZamaSDK) — SDK constructor reference
