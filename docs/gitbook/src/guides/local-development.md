---
title: Local development
description: How to use the cleartext relayer from TypeScript, Go, and Rust for local Hardhat nodes and custom chain deployments without a KMS or gateway.
---

# Local development

The SDK ships a `cleartext()` relayer factory that creates a cleartext relayer, replacing FHE operations with cleartext operations. Values are stored as plaintext on-chain — no KMS, no gateway, no WASM. Use it for local Hardhat nodes, custom testnets, or any chain where you deploy FHEVM contracts in cleartext mode.

The `cleartext()` relayer factory implements the same `RelayerSDK` interface as `web()` and `node()`, so the rest of your code stays unchanged.

{% hint style="warning" %}
Cleartext mode is blocked on Ethereum Mainnet (chain 1) and Sepolia (chain 11155111). It is intended for development and testing only.
{% endhint %}

## SDK setup

### 1. Install packages

{% tabs %}
{% tab title="Core SDK" %}

```bash
npm install @zama-fhe/sdk viem
```

{% endtab %}
{% tab title="Go" %}

Install the client and start the daemon as in the [Go quick start](../native/tutorials/go-quick-start.md).

```bash
go get github.com/zama-ai/sdk/clients/go/v3
```

{% endtab %}
{% tab title="Rust" %}

Install the client and start the daemon as in the [Rust quick start](../native/tutorials/rust-quick-start.md).

```bash
cargo add zama_sdk
```

{% endtab %}
{% endtabs %}

### 2. Use the `cleartext()` relayer with `createConfig`

Available in the Core SDK and React SDK. Go and Rust select the cleartext relayer in the next step.

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { cleartext, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
```

### 3. Create the config with a Hardhat chain

For a local Hardhat network, use the built-in `hardhat` chain object:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const config = createConfig({
  chains: [{ ...hardhat, executorAddress: "0xYourExecutorAddress" }],
  publicClient,
  walletClient,
  storage: memoryStorage,
  relayers: { [hardhat.id]: cleartext() },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Go" %}

The daemon container must reach your node: run it with `--network host` and `http://127.0.0.1:8545` on Linux, or use `http://host.docker.internal:8545` on Docker Desktop.

```go
rpcURL := "http://host.docker.internal:8545"
executor := "0xYourExecutorAddress"
config := zama.SDKConfig{
	Chains: []zama.ChainConfig{{
		ID:              31337, // Hardhat preset
		Network:         &rpcURL,
		ExecutorAddress: &executor,
	}},
	Relayers: map[uint64]zama.RelayerConfig{
		31337: {Transport: zama.RelayerCleartext},
	},
}
```

{% endtab %}
{% tab title="Rust" %}

The daemon container must reach your node: run it with `--network host` and `http://127.0.0.1:8545` on Linux, or use `http://host.docker.internal:8545` on Docker Desktop.

```rust
let mut chain = ChainConfig::new(31_337, "http://host.docker.internal:8545"); // Hardhat preset
chain.executor_address = Some("0xYourExecutorAddress".into());
let mut config = SdkConfig::from_chains(31_337, vec![chain]);
config.relayers = Some(BTreeMap::from([(
    31_337,
    RelayerConfig {
        transport: RelayerTransport::Cleartext,
        options: None,
    },
)]));
```

{% endtab %}
{% endtabs %}

The `executorAddress` is the deployed `CleartextFHEVMExecutor` contract address from your Hardhat setup. It must be set on the chain definition — `cleartext()` picks it up automatically.

### 4. Use the SDK normally

Available in the Core SDK and React SDK.

The wrapper API works the same as in production setups:

```ts
const wrappedToken = sdk.createWrappedToken("0xWrappedEncryptedERC20");
await wrappedToken.shield(1000n);
const [address] = await walletClient.getAddresses();
const balance = await wrappedToken.balanceOf(address);
```

### 5. (Optional) Create a custom config for your own chain

If you deploy FHEVM contracts on a custom chain or at different addresses than the default ones, pass all required fields to the chain definition used with the `cleartext()` relayer factory:

{% tabs %}
{% tab title="Core SDK" %}

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
  relayers: { [myHardhat.id]: cleartext() },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Go" %}

```go
ptr := func(value string) *string { return &value }
gatewayChainID := uint64(10901)
config := zama.SDKConfig{
	Chains: []zama.ChainConfig{{
		ID:                                 12345,
		Network:                            ptr("http://host.docker.internal:8545"),
		GatewayChainID:                     &gatewayChainID,
		RelayerURL:                         ptr(""),
		ACLContractAddress:                 ptr("0x..."),
		KMSContractAddress:                 ptr("0x..."),
		InputVerifierContractAddress:       ptr("0x..."),
		VerifyingContractAddressDecryption: ptr("0x..."),
		VerifyingContractAddressInputVerification: ptr("0x..."),
		ExecutorAddress: ptr("0x..."),
	}},
	Relayers: map[uint64]zama.RelayerConfig{
		12345: {Transport: zama.RelayerCleartext},
	},
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
let mut chain = ChainConfig::new(12_345, "http://host.docker.internal:8545");
chain.gateway_chain_id = Some(10_901);
chain.relayer_url = Some(String::new());
chain.acl_contract_address = Some("0x...".into());
chain.kms_contract_address = Some("0x...".into());
chain.input_verifier_contract_address = Some("0x...".into());
chain.verifying_contract_address_decryption = Some("0x...".into());
chain.verifying_contract_address_input_verification = Some("0x...".into());
chain.executor_address = Some("0x...".into());
let mut config = SdkConfig::from_chains(12_345, vec![chain]);
config.relayers = Some(BTreeMap::from([(
    12_345,
    RelayerConfig {
        transport: RelayerTransport::Cleartext,
        options: None,
    },
)]));
```

{% endtab %}
{% endtabs %}

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

- [RelayerCleartext reference](../reference/sdk/RelayerCleartext.md) — the cleartext relayer and its chain-definition fields
- [Configuration](./configuration.md) — production setup with `web()` or `node()` relayer factories
- [Chain Objects](../reference/sdk/network-presets.md) — pre-configured chain definitions for Mainnet, Sepolia, and more
