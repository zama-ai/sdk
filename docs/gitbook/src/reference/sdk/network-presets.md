---
title: Network presets
description: Pre-configured chain objects and legacy network configs for supported networks.
---

# Network presets

## Chain objects (recommended)

Import pre-configured chain objects from `@zama-fhe/sdk/chains`. Each chain includes contract addresses, relayer URLs, chain IDs, and an `id` alias for use in transport config keys.

```ts
import { sepolia, mainnet, hoodi, hardhat } from "@zama-fhe/sdk/chains";
```

### Available chains

| Chain     | Chain ID   | Network            |
| --------- | ---------- | ------------------ |
| `mainnet` | `1`        | Ethereum Mainnet   |
| `sepolia` | `11155111` | Sepolia Testnet    |
| `hoodi`   | `17000`    | Hoodi Testnet      |
| `hardhat` | `31337`    | Local Hardhat node |

### What each chain includes

Each chain object extends `ExtendedFhevmInstanceConfig` with an `id` property:

| Field                                       | Type                  | Description                                                                                              |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                        | `number`              | Chain identifier (same as `chainId`)                                                                     |
| `chainId`                                   | `number`              | Chain identifier                                                                                         |
| `gatewayChainId`                            | `number`              | Chain ID of the gateway                                                                                  |
| `relayerUrl`                                | `string`              | Default relayer endpoint for this network                                                                |
| `network`                                   | `string`              | Default RPC URL for this network                                                                         |
| `aclContractAddress`                        | `Address`             | ACL contract address                                                                                     |
| `kmsContractAddress`                        | `Address`             | KMS contract address                                                                                     |
| `inputVerifierContractAddress`              | `Address`             | Input verifier contract address                                                                          |
| `verifyingContractAddressDecryption`        | `Address`             | EIP-712 verifying contract for decrypt operations                                                        |
| `verifyingContractAddressInputVerification` | `Address`             | EIP-712 verifying contract for encrypt operations                                                        |
| `registryAddress`                           | `string \| undefined` | Token wrapper registry contract address (undefined for chains without a deployed registry, e.g. Hardhat) |

### Usage with `createZamaConfig`

Pass chain objects in the `chains` array and use `chain.id` as transport keys:

```ts
import { createZamaConfig, web } from "@zama-fhe/sdk";
import { sepolia, mainnet } from "@zama-fhe/sdk/chains";

const config = createZamaConfig({
  chains: [sepolia, mainnet],
  viem: { publicClient, walletClient },
  transports: {
    [sepolia.id]: web({ relayerUrl: "https://your-app.com/api/relayer/11155111" }),
    [mainnet.id]: web({ relayerUrl: "https://your-app.com/api/relayer/1" }),
  },
});
```

Per-chain overrides (e.g. `relayerUrl`, `network`) are passed to the transport function. The chain object provides all contract addresses automatically.

### Browser apps

In browser environments, proxy relayer requests through your backend to avoid exposing API keys. Override `relayerUrl` in the transport:

```ts
web({ relayerUrl: "https://your-app.com/api/relayer/11155111" });
```

### Server apps

On the server, use `node()` and add authentication:

```ts
import { node } from "@zama-fhe/sdk";

node(
  {
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
    auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
  },
  { poolSize: 4 },
);
```

### Local development

Use the `hardhat` chain with a `cleartext()` transport:

```ts
import { cleartext } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";

const config = createZamaConfig({
  chains: [hardhat],
  viem: { publicClient, walletClient },
  transports: {
    [hardhat.id]: cleartext({ executorAddress: "0x..." }),
  },
});
```

### Multiple networks

Support multiple networks by listing them in the `chains` array:

```ts
import { sepolia, mainnet } from "@zama-fhe/sdk/chains";

const config = createZamaConfig({
  chains: [sepolia, mainnet],
  wagmiConfig,
  transports: {
    [sepolia.id]: web({ relayerUrl: "/api/relayer/11155111" }),
    [mainnet.id]: web({ relayerUrl: "/api/relayer/1" }),
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
For new projects, prefer chain objects from `@zama-fhe/sdk/chains` with `createZamaConfig`. The legacy preset configs work best with the manual `RelayerWeb`/`RelayerNode` constructors.
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
- [Configuration guide](/guides/configuration) — full chains, transports, signer, and storage setup
- [ZamaSDK](/reference/sdk/ZamaSDK) — SDK constructor reference
