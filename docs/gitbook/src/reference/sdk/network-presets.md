---
title: Network Presets
description: Pre-configured network settings for Ethereum Mainnet, Sepolia, and Hardhat.
---

# Network Presets

Pre-configured objects containing relayer URLs, contract addresses, and chain IDs for supported networks.

## Import

```ts
import { MainnetConfig, SepoliaConfig, HardhatConfig } from "@zama-fhe/sdk";
```

## Available presets

| Preset          | Chain ID   | Network            |
| --------------- | ---------- | ------------------ |
| `MainnetConfig` | `1`        | Ethereum Mainnet   |
| `SepoliaConfig` | `11155111` | Sepolia Testnet    |
| `HardhatConfig` | `31337`    | Local Hardhat node |

## What each preset includes

Each preset provides the fields needed by a relayer transport:

| Field                                       | Type      | Description                                       |
| ------------------------------------------- | --------- | ------------------------------------------------- |
| `chainId`                                   | `number`  | Chain identifier                                  |
| `gatewayChainId`                            | `number`  | Chain ID of the gateway                           |
| `relayerUrl`                                | `string`  | Default relayer endpoint for this network         |
| `network`                                   | `string`  | Default RPC URL for this network                  |
| `aclContractAddress`                        | `Address` | ACL contract address                              |
| `kmsContractAddress`                        | `Address` | KMS contract address                              |
| `inputVerifierContractAddress`              | `Address` | Input verifier contract address                   |
| `verifyingContractAddressDecryption`        | `Address` | EIP-712 verifying contract for decrypt operations |
| `verifyingContractAddressInputVerification` | `Address` | EIP-712 verifying contract for encrypt operations |

## Usage

Spread a preset into your transport config and add the fields specific to your setup:

```ts
import { RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

### Browser apps

In browser environments, proxy relayer requests through your backend to avoid exposing API keys. Override `relayerUrl` to point at your proxy:

```ts
{
  ...SepoliaConfig,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
}
```

### Server apps

On the server, use `RelayerNode` and add authentication:

```ts
import { RelayerNode } from "@zama-fhe/sdk/node";
import { SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerNode({
  getChainId: async () => 11155111,
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { apiKey: process.env.RELAYER_API_KEY },
    },
  },
});
```

### Local development

Use `HardhatConfig` with a local Hardhat node:

```ts
import { HardhatConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [HardhatConfig.chainId]: HardhatConfig,
  },
});
```

### Multiple networks

Support multiple networks by spreading several presets:

```ts
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

The relayer selects the correct transport based on the chain ID returned by `getChainId()`.

## Related

- [Configuration guide](/guides/configuration) — full relayer, signer, and storage setup
- [ZamaSDK](/reference/sdk/ZamaSDK) — SDK constructor reference
