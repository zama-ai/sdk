---
title: RelayerCleartext
description: Development relayer that operates in cleartext mode without FHE, KMS, or gateway dependencies.
---

# RelayerCleartext

Development relayer that operates in cleartext mode. Values are stored as plaintext on-chain via the CleartextFHEVMExecutor contract. Implements the same `RelayerSDK` interface as `RelayerWeb` and `RelayerNode`.

## Import

```ts
import { createCleartextRelayer } from "@zama-fhe/sdk/cleartext";
```

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { createCleartextRelayer, hoodi } from "@zama-fhe/sdk/cleartext";

const relayer = createCleartextRelayer(hoodi);
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

## Factory

```ts
import { createCleartextRelayer } from "@zama-fhe/sdk/cleartext";
import type { CleartextChainConfig } from "@zama-fhe/sdk/cleartext";

const relayer = createCleartextRelayer(config);
```

Returns a `RelayerSDK` instance that operates in cleartext mode.

## Config (`CleartextChainConfig`)

### chainId

`bigint`

Target chain ID. Mainnet (1) and Sepolia (11155111) are blocked — cleartext mode is for development only.

### rpcUrl

`string | EIP1193Provider`

RPC URL or EIP-1193 provider for reading on-chain state (ACL checks, plaintext values).

```ts
const relayer = createCleartextRelayer({
  ...hoodi,
  rpcUrl: "http://localhost:8545",
});
```

### gatewayChainId

`number`

Chain ID of the gateway chain, used in EIP-712 domain construction for signature verification.

### contracts

`CleartextContracts`

Object containing all deployed contract addresses:

| Field                    | Type      | Description                                                  |
| ------------------------ | --------- | ------------------------------------------------------------ |
| `acl`                    | `Address` | ACL contract — verifies `persistAllowed` and decryption ACLs |
| `executor`               | `Address` | CleartextFHEVMExecutor — stores plaintext values             |
| `inputVerifier`          | `Address` | Input verifier contract                                      |
| `kmsVerifier`            | `Address` | KMS verifier contract                                        |
| `verifyingInputVerifier` | `Address` | EIP-712 verifying contract for encrypt operations            |
| `verifyingDecryption`    | `Address` | EIP-712 verifying contract for decrypt operations            |

## Presets

One preset is exported for the Hoodi testnet:

```ts
import { hoodi } from "@zama-fhe/sdk/cleartext";
```

| Preset  | Chain ID | Network                            |
| ------- | -------- | ---------------------------------- |
| `hoodi` | `560048` | `https://rpc.hoodi.ethpandaops.io` |

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
