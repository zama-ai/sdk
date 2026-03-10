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
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";

const relayer = new RelayerCleartext(hardhatCleartextConfig);
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
import type { CleartextConfig } from "@zama-fhe/sdk/cleartext";
```

### chainId

`number`

Target chain ID. Mainnet (1) and Sepolia (11155111) are blocked — cleartext mode is for development only.

### network

`string | EIP1193Provider`

RPC URL or EIP-1193 provider for reading on-chain state (ACL checks, plaintext values).

```ts
const relayer = new RelayerCleartext({
  ...hardhatCleartextConfig,
  network: "http://localhost:8545",
});
```

### aclContractAddress

`Address`

Deployed ACL contract address. Used to verify `persistAllowed` and `isAllowedForDecryption` before returning values.

### executorAddress

`Address`

Deployed CleartextFHEVMExecutor contract address. The relayer reads cleartext values from `plaintexts(handle)` on this contract.

### gatewayChainId

`number`

Chain ID of the gateway chain, used in EIP-712 domain construction for signature verification.

### verifyingContractAddressDecryption

`Address`

Address of the Decryption contract on the gateway chain. Used as `verifyingContract` in EIP-712 signatures for decrypt operations.

### verifyingContractAddressInputVerification

`Address`

Address of the InputVerification contract on the gateway chain. Used as `verifyingContract` in EIP-712 signatures for encrypt operations.

---

### kmsSignerPrivateKey

`Hex | undefined`

Private key for signing decryption EIP-712 messages. Defaults to a built-in mock key.

### inputSignerPrivateKey

`Hex | undefined`

Private key for signing input verification EIP-712 messages. Defaults to a built-in mock key.

## Presets

Two presets are exported for common environments:

```ts
import { hardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
```

| Preset                   | Chain ID | Network                            |
| ------------------------ | -------- | ---------------------------------- |
| `hardhatCleartextConfig` | `31337`  | `http://127.0.0.1:8545`            |
| `hoodiCleartextConfig`   | `560048` | `https://rpc.hoodi.ethpandaops.io` |

## Methods

`RelayerCleartext` implements the full `RelayerSDK` interface:

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
