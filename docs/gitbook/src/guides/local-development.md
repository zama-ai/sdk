---
title: Local development
description: How to use the cleartext relayer for local Hardhat nodes and custom chain deployments without a KMS or gateway.
---

# Local development

The SDK ships a `cleartext()` relayer factory that creates a cleartext relayer, replacing FHE operations with cleartext operations. Values are stored as plaintext on-chain — no KMS, no gateway, no WASM. Use it for local Hardhat nodes, custom testnets, or any chain where you deploy FHEVM contracts in cleartext mode.

The `cleartext()` relayer factory implements the same `RelayerSDK` interface as `web()` and `node()`, so the rest of your code stays unchanged.

{% hint style="warning" %}
Cleartext mode is blocked on Ethereum Mainnet (chain 1) and Sepolia (chain 11155111). It is intended for development and testing only.
{% endhint %}

## SDK setup

### 1. Install packages

```bash
npm install @zama-fhe/sdk viem
```

### 2. Use the `cleartext()` relayer with `createConfig`

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { cleartext, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
```

### 3. Create the config with a Hardhat chain

For a local Hardhat network, use the built-in `hardhat` chain object:

```ts
const config = createConfig({
  chains: [{ ...hardhat, executorAddress: "0xYourExecutorAddress" }],
  publicClient,
  walletClient,
  storage: memoryStorage,
  relayers: {
    [hardhat.id]: cleartext(),
  },
});

const sdk = new ZamaSDK(config);
```

The `executorAddress` is the deployed `CleartextFHEVMExecutor` contract address from your Hardhat setup. It must be set on the chain definition — `cleartext()` picks it up automatically.

### 4. Use the SDK normally

The token API works exactly the same:

```ts
const token = sdk.createToken("0xEncryptedERC20");
await token.shield(1000n);
const balance = await token.balanceOf();
```

### 5. (Optional) Create a custom config for your own chain

If you deploy FHEVM contracts on a custom chain or at different addresses than the default ones, pass all required fields to the chain definition used with the `cleartext()` relayer factory:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { cleartext, ZamaSDK } from "@zama-fhe/sdk";
import type { FheChain } from "@zama-fhe/sdk/chains";

const myHardhat = {
  id: 12345,
  network: "http://localhost:8545",
  gatewayChainId: 10901,
  aclContractAddress: "0x...",
  kmsContractAddress: "0x...",
  inputVerifierContractAddress: "0x...",
  verifyingContractAddressDecryption: "0x...",
  verifyingContractAddressInputVerification: "0x...",
  executorAddress: "0x...",
  registryAddress: undefined,
  relayerUrl: "",
} as const satisfies FheChain;

const config = createConfig({
  chains: [myHardhat],
  publicClient,
  walletClient,
  relayers: {
    [myHardhat.id]: cleartext(),
  },
});

const sdk = new ZamaSDK(config);
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
- [Configuration](/guides/configuration) — production setup with `web()` or `node()` relayer factories
- [Chain Objects](/reference/sdk/network-presets) — pre-configured chain definitions for Mainnet, Sepolia, and more
