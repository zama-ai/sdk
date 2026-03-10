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

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";

const relayer = new RelayerCleartext(hoodiCleartextConfig);
```

{% endtab %}
{% tab title="sdk.ts" %}

```ts
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: memoryStorage,
});
```

{% endtab %}
{% endtabs %}

## Constructor

```ts
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import type { CleartextConfig } from "@zama-fhe/sdk/cleartext";

const relayer = new RelayerCleartext(config);
```

Takes a single `CleartextConfig` object.

## Config (`CleartextConfig`)

### chainId

`number`

Target chain ID. Mainnet (1) and Sepolia (11155111) are blocked — cleartext mode is for development only.

### network

`string | EIP1193Provider`

RPC URL or EIP-1193 provider for reading on-chain state (ACL checks, plaintext values).

```ts
const relayer = new RelayerCleartext({
  ...hoodiCleartextConfig,
  network: "http://localhost:8545",
});
```

### gatewayChainId

`number`

Chain ID of the gateway chain, used in EIP-712 domain construction for signature verification.

### aclContractAddress

`Address`

Deployed ACL contract — verifies `persistAllowed` and decryption ACLs.

### executorAddress

`Address`

Deployed CleartextFHEVMExecutor contract — stores plaintext values.

### verifyingContractAddressDecryption

`Address`

EIP-712 verifying contract for decrypt operations on the gateway chain.

### verifyingContractAddressInputVerification

`Address`

EIP-712 verifying contract for encrypt operations on the gateway chain.

---

### kmsSignerPrivateKey

`Hex | undefined`

Private key for the KMS signer used in EIP-712 decryption verification. Falls back to a built-in mock key when omitted.

### inputSignerPrivateKey

`Hex | undefined`

Private key for the input signer used in EIP-712 input verification. Falls back to a built-in mock key when omitted.

## Presets

Two presets are exported:

```ts
import { hoodiCleartextConfig, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
```

| Preset                   | Chain ID | Network                            |
| ------------------------ | -------- | ---------------------------------- |
| `hoodiCleartextConfig`   | `560048` | `https://rpc.hoodi.ethpandaops.io` |
| `hardhatCleartextConfig` | `31337`  | `http://127.0.0.1:8545`            |

## Methods

The cleartext relayer implements the full `RelayerSDK` interface:

| Method                                  | Description                                                |
| --------------------------------------- | ---------------------------------------------------------- |
| `generateKeypair()`                     | Returns a random mock keypair.                             |
| `encrypt(params)`                       | Computes mock ciphertext handles and signs an input proof. |
| `userDecrypt(params)`                   | Reads plaintext from TFHEExecutor after ACL checks.        |
| `publicDecrypt(handles)`                | Reads plaintext for handles allowed for public decryption. |
| `delegatedUserDecrypt(params)`          | Reads plaintext via delegated authorization.               |
| `createEIP712(...)`                     | Returns a user-decrypt EIP-712 typed data object.          |
| `createDelegatedUserDecryptEIP712(...)` | Returns a delegated-decrypt EIP-712 typed data object.     |
| `getPublicKey()`                        | Returns a mock public key.                                 |
| `getPublicParams(bits)`                 | Returns mock public parameters.                            |
| `terminate()`                           | No-op — no resources to release.                           |

{% hint style="info" %}
`requestZKProofVerification` throws a `ConfigurationError` — ZK proofs are not supported in cleartext mode.
{% endhint %}

## Related

- [Local Development guide](/guides/local-development) — when and how to use cleartext mode
- [RelayerWeb](/reference/sdk/RelayerWeb) — browser relayer with real FHE
- [RelayerNode](/reference/sdk/RelayerNode) — Node.js relayer with real FHE
- [Network Presets](/reference/sdk/network-presets) — production network configs
