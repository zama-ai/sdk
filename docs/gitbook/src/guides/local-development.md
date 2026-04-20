---
title: Local development
description: How to use the cleartext transport for local Hardhat nodes and custom chain deployments without a KMS or gateway.
---

# Local development

The SDK ships a `cleartext()` transport that replaces FHE operations with cleartext operations. Values are stored as plaintext on-chain — no KMS, no gateway, no WASM. Use it for local Hardhat nodes, custom testnets, or any chain where you deploy FHEVM contracts in cleartext mode.

The `cleartext()` transport implements the same `RelayerSDK` interface as `web()` and `node()`, so the rest of your code stays unchanged.

{% hint style="warning" %}
Cleartext mode is blocked on Ethereum Mainnet (chain 1) and Sepolia (chain 11155111). It is intended for development and testing only.
{% endhint %}

## SDK setup

### 1. Install packages

```bash
npm install @zama-fhe/sdk viem
```

### 2. Use the `cleartext()` transport with `createZamaConfig`

```ts
import { createZamaConfig, cleartext, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
```

### 3. Create the config with a Hardhat chain

For a local Hardhat network, use the built-in `hardhat` chain object:

```ts
const config = createZamaConfig({
  chains: [hardhat],
  viem: { publicClient, walletClient },
  storage: memoryStorage,
  transports: {
    [hardhat.id]: cleartext({ executorAddress: "0xYourExecutorAddress" }),
  },
});

const sdk = new ZamaSDK(config);
```

The `executorAddress` is the deployed `CleartextFHEVMExecutor` contract address from your Hardhat setup.

### 4. Use the SDK normally

The token API works exactly the same:

```ts
const token = sdk.createToken("0xEncryptedERC20");
await token.shield(1000n);
const balance = await token.balanceOf();
```

### 5. (Optional) Use the standalone `RelayerCleartext` class

If you prefer the manual relayer approach (e.g. for test fixtures), you can still use `RelayerCleartext` directly:

```ts
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";

const relayer = new RelayerCleartext(hardhatCleartextConfig);

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: memoryStorage,
});
```

Zama provides a cleartext deployment for the Hoodi testnet, via `hoodiCleartextConfig`:

```ts
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";

const relayer = new RelayerCleartext(hoodiCleartextConfig);
```

### 6. (Optional) Create a custom config for your own chain

If you deploy FHEVM contracts on a custom chain or at different addresses than the default ones, pass all required fields to the `cleartext()` transport:

```ts
import { createZamaConfig, cleartext, ZamaSDK } from "@zama-fhe/sdk";

const myChain = {
  id: 12345,
  chainId: 12345,
  network: "http://localhost:8545",
  gatewayChainId: 10901,
  aclContractAddress: "0x...",
  kmsContractAddress: "0x...",
  inputVerifierContractAddress: "0x...",
  verifyingContractAddressDecryption: "0x...",
  verifyingContractAddressInputVerification: "0x...",
  relayerUrl: "",
};

const config = createZamaConfig({
  chains: [myChain],
  viem: { publicClient, walletClient },
  transports: {
    [myChain.id]: cleartext({
      executorAddress: "0x...",
      chainId: 12345,
      network: "http://localhost:8545",
      gatewayChainId: 10901,
      aclContractAddress: "0x...",
      verifyingContractAddressDecryption: "0x...",
      verifyingContractAddressInputVerification: "0x...",
    }),
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
- [Configuration](/guides/configuration) — production setup with `web()` or `node()` transports
- [Chain Objects](/reference/sdk/network-presets) — pre-configured chain definitions for Mainnet, Sepolia, and more
