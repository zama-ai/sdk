---
title: RelayerCleartext
description: Development relayer that operates in cleartext mode without FHE, KMS, or gateway dependencies.
---

# RelayerCleartext

Development relayer that operates in cleartext mode. Values are stored as plaintext on-chain via the CleartextFHEVMExecutor contract. Implements the same `RelayerSDK` interface as `RelayerWeb` and `RelayerNode`.

## Import

```ts
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
```

{% hint style="info" %}
For most applications, prefer the `cleartext()` transport factory with `createConfig` instead of constructing `RelayerCleartext` directly. See [Network Presets](./network-presets.md) for examples.
{% endhint %}

## Usage

{% tabs %}
{% tab title="Recommended (cleartext transport)" %}

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

{% endtab %}
{% tab title="Direct construction" %}

```ts
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { hardhat } from "@zama-fhe/sdk/chains";

const relayer = new RelayerCleartext(hardhat);
```

{% endtab %}
{% endtabs %}

## Constructor

```ts
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";

const relayer = new RelayerCleartext(chain);
```

Takes a single `FheChain` object directly. Mainnet (1) and Sepolia (11155111) chain IDs are blocked — cleartext mode is for development only.

The `FheChain` fields relevant to cleartext mode are:

| Field                                       | Type                        | Description                                                |
| ------------------------------------------- | --------------------------- | ---------------------------------------------------------- |
| `id`                                        | `number`                    | Chain ID (must not be 1 or 11155111)                       |
| `network`                                   | `EIP1193Provider \| string` | RPC URL or provider for reading on-chain state             |
| `gatewayChainId`                            | `number`                    | Gateway chain ID for EIP-712 domain construction           |
| `aclContractAddress`                        | `Address`                   | ACL contract for permission checks                         |
| `executorAddress`                           | `Address`                   | CleartextFHEVMExecutor contract storing plaintext values   |
| `verifyingContractAddressDecryption`        | `Address`                   | EIP-712 verifying contract for decrypt operations          |
| `verifyingContractAddressInputVerification` | `Address`                   | EIP-712 verifying contract for encrypt operations          |
| `kmsSignerPrivateKey`                       | `Hex \| undefined`          | KMS signer private key (falls back to built-in mock key)   |
| `inputSignerPrivateKey`                     | `Hex \| undefined`          | Input signer private key (falls back to built-in mock key) |

Built-in chain presets (`hardhat`, `hoodi`) already include all required fields:

```ts
import { hardhat, hoodi } from "@zama-fhe/sdk/chains";

const relayer = new RelayerCleartext(hardhat);
```

## Methods

The cleartext relayer implements the full `RelayerSDK` interface:

| Method                                  | Description                                                         |
| --------------------------------------- | ------------------------------------------------------------------- |
| `generateTransportKeyPair()`            | Returns a random mock transport key pair.                           |
| `encrypt(params)`                       | Computes mock ciphertext handles and signs an input proof.          |
| `userDecrypt(params)`                   | Reads plaintext from TFHEExecutor after ACL checks.                 |
| `publicDecrypt(encryptedValues)`        | Reads plaintext for encrypted values allowed for public decryption. |
| `delegatedUserDecrypt(params)`          | Reads plaintext via delegated authorization.                        |
| `createEIP712(...)`                     | Returns a user-decrypt EIP-712 typed data object.                   |
| `createDelegatedUserDecryptEIP712(...)` | Returns a delegated-decrypt EIP-712 typed data object.              |
| `fetchFheEncryptionKeyBytes()`          | Returns a mock FHE encryption key.                                  |
| `getPublicParams(bits)`                 | Returns mock public parameters.                                     |
| `terminate()`                           | No-op — no resources to release.                                    |

{% hint style="info" %}
`requestZKProofVerification` throws a `ConfigurationError` — ZK proofs are not supported in cleartext mode.
{% endhint %}

## Related

- [Local Development guide](../../guides/local-development.md) — when and how to use cleartext mode
- [RelayerWeb](./RelayerWeb.md) — browser relayer with real FHE
- [RelayerNode](./RelayerNode.md) — Node.js relayer with real FHE
- [Network Presets](./network-presets.md) — production network configs
