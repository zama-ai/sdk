---
title: Local Development
description: How to use the cleartext relayer for local Hardhat nodes and custom chain deployments without a KMS or gateway.
---

# Local Development

The SDK ships a `createCleartextRelayer` factory that replaces the FHE relayer with a cleartext implementation. Values are stored as plaintext on-chain — no KMS, no gateway, no WASM. Use it for local Hardhat nodes, custom testnets, or any chain where you deploy fhEVM contracts in cleartext mode.

The cleartext relayer implements the same `RelayerSDK` interface as `RelayerWeb` and `RelayerNode`, so the rest of your code stays unchanged.

{% hint style="warning" %}
Cleartext mode is blocked on Ethereum Mainnet (chain 1) and Sepolia (chain 11155111). It is intended for development and testing only.
{% endhint %}

## Steps

### 1. Install packages

```bash
npm install @zama-fhe/sdk viem
```

### 2. Import from the `/cleartext` sub-path

```ts
import { createCleartextRelayer, hoodi } from "@zama-fhe/sdk/cleartext";
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
```

### 3. Create the relayer with a preset

For the Hoodi testnet, use the built-in `hoodi` preset:

```ts
const relayer = createCleartextRelayer(hoodi);
```

### 4. Plug into `ZamaSDK`

The relayer is a drop-in replacement — pass it like any other relayer:

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: memoryStorage,
});
```

The token API works exactly the same:

```ts
const token = sdk.createToken("0xEncryptedERC20");
await token.shield(1000n);
const balance = await token.balanceOf();
```

### 5. (Optional) Create a custom config for your own chain

If you deploy fhEVM contracts on a custom chain, build a `CleartextChainConfig` manually. Each field maps to a contract address from your deployment:

```ts
import type { CleartextChainConfig } from "@zama-fhe/sdk/cleartext";

const myChainConfig: CleartextChainConfig = {
  // Chain identity
  chainId: 12345n, // bigint
  rpcUrl: "http://localhost:8545", // RPC URL or EIP-1193 provider
  gatewayChainId: 10901, // Chain ID of the gateway (usually same as Hardhat default)

  // Contract addresses from your own deployment
  contracts: {
    acl: "0x...", // ACL contract
    executor: "0x...", // CleartextFHEVMExecutor — stores plaintext values
    inputVerifier: "0x...", // Input verifier contract
    kmsVerifier: "0x...", // KMS verifier contract
    verifyingDecryption: "0x...", // EIP-712 verifying contract for decryption
    verifyingInputVerifier: "0x...", // EIP-712 verifying contract for input verification
  },
};

const relayer = createCleartextRelayer(myChainConfig);
```

**Where to find these addresses:**

| Field                              | Source                                            |
| ---------------------------------- | ------------------------------------------------- |
| `contracts.acl`                    | Deployed ACL contract address                     |
| `contracts.executor`               | Deployed CleartextFHEVMExecutor contract address  |
| `contracts.inputVerifier`          | Deployed input verifier contract address          |
| `contracts.kmsVerifier`            | Deployed KMS verifier contract address            |
| `contracts.verifyingDecryption`    | Decryption contract on the gateway chain          |
| `contracts.verifyingInputVerifier` | InputVerification contract on the gateway chain   |
| `gatewayChainId`                   | The chain ID where gateway contracts are deployed |

{% hint style="info" %}
Usually, you want to use the same `gatewayChainId` and verifying contracts as the Hardhat defaults.
{% endhint %}

## Next steps

- [RelayerCleartext reference](/reference/sdk/RelayerCleartext) — full factory options and `CleartextChainConfig` type
- [Configuration](/guides/configuration) — production setup with `RelayerWeb` or `RelayerNode`
- [Network Presets](/reference/sdk/network-presets) — preset configs for Mainnet, Sepolia, and Hardhat
