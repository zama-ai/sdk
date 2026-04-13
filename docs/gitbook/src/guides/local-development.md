---
title: Local development
description: How to use the cleartext relayer for local Hardhat nodes and custom chain deployments without a KMS or gateway.
---

# Local development

The SDK ships `RelayerCleartext`, a drop-in relayer that replaces FHE operations with cleartext operations. Values are stored as plaintext on-chain — no KMS, no gateway, no WASM. Use it for local Hardhat nodes, custom testnets, or any chain where you deploy FHEVM contracts in cleartext mode.

`RelayerCleartext` implements the same `RelayerSDK` interface as `RelayerWeb` and `RelayerNode`, so the rest of your code stays unchanged.

{% hint style="warning" %}
Cleartext mode is blocked on Ethereum Mainnet (chain 1) and Sepolia (chain 11155111). It is intended for development and testing only.
{% endhint %}

## SDK setup

### 1. Install packages

```bash
npm install @zama-fhe/sdk viem
```

### 2. Import from the `/cleartext` sub-path

```ts
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
```

### 3. Create the relayer with a preset

For a local Hardhat network, use the built-in `hardhatCleartextConfig` preset:

```ts
const relayer = new RelayerCleartext(hardhatCleartextConfig);
```

Zama provides a cleartext deployment for the Hoodi testnet, via `hoodiCleartextConfig`:

```ts
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";

const relayer = new RelayerCleartext(hoodiCleartextConfig);
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

If you deploy FHEVM contracts on a custom chain or at different addresses than the default ones, build a `CleartextConfig` manually. Each field maps to a contract address from your deployment:

```ts
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import type { CleartextConfig } from "@zama-fhe/sdk/cleartext";

const myChainConfig: CleartextConfig = {
  chainId: 12345,
  network: "http://localhost:8545", // RPC URL or EIP-1193 provider
  gatewayChainId: 10901,

  // Contract addresses from your own deployment
  aclContractAddress: "0x...",
  executorAddress: "0x...",
  verifyingContractAddressDecryption: "0x...",
  verifyingContractAddressInputVerification: "0x...",
};

const relayer = new RelayerCleartext(myChainConfig);
```

**Where to find these addresses:**

| Field                                       | Source                                            |
| ------------------------------------------- | ------------------------------------------------- |
| `aclContractAddress`                        | Deployed ACL contract address                     |
| `executorAddress`                           | Deployed CleartextFHEVMExecutor contract address  |
| `verifyingContractAddressDecryption`        | Decryption contract on the gateway chain          |
| `verifyingContractAddressInputVerification` | InputVerification contract on the gateway chain   |
| `gatewayChainId`                            | The chain ID where gateway contracts are deployed |

{% hint style="info" %}
Usually, you want to use the same `gatewayChainId` and verifying contract addresses as the Hardhat defaults. You can also provide optional `kmsSignerPrivateKey` and `inputSignerPrivateKey` fields for custom EIP-712 verification signers.
{% endhint %}

## Next steps

- [RelayerCleartext reference](/reference/sdk/RelayerCleartext) — full constructor options and `CleartextConfig` type
- [Configuration](/guides/configuration) — production setup with `RelayerWeb` or `RelayerNode`
- [Network Presets](/reference/sdk/network-presets) — preset configs for Mainnet, Sepolia, and Hardhat
