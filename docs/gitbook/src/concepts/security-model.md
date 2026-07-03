---
title: Security model
description: Threat model, trust assumptions, and security architecture of the Zama SDK.
---

# Security model

This page describes what the SDK protects, what it exposes, and the trust assumptions underlying its design. Understanding these boundaries helps you make informed decisions about deploying confidential tokens.

## What is encrypted

Confidential tokens encrypt **balances** and **confidential transfer amounts**. When a user transfers 500 tokens privately, the plaintext amount is FHE-encrypted client-side before the transaction reaches the blockchain, and the on-chain contract only ever sees the ciphertext.

Shielding and unshielding are the public boundary: they convert tokens between a public ERC-20 and its confidential form, so the **shield/unshield amount is visible on-chain** — it is an ordinary public ERC-20 movement. Privacy begins once tokens are in confidential form: the resulting balance is encrypted, and later confidential transfers hide their amounts.

The on-chain contract stores FHE ciphertexts instead of `uint256` values. Only the balance owner (via their FHE private key and the relayer KMS) can decrypt their own balance.

## What is visible

FHE protects values, not metadata. The following remain publicly observable on-chain:

- **Transaction existence** — that a transaction occurred is visible in the block.
- **Participant addresses** — sender and receiver addresses are part of the transaction.
- **Token contract address** — which confidential token is involved.
- **Transaction type** — whether the call is a shield, transfer, unshield, or approval.
- **Shield and unshield amounts** — converting between public ERC-20 and confidential form is a public ERC-20 transfer, so the converted amount is visible. Only confidential transfers hide their amounts.
- **Gas costs** — standard Ethereum gas accounting.
- **Timing** — when transactions occur.

An observer can see that address A sent a confidential transfer to address B on token contract C. They cannot see how much was sent.

{% hint style="info" %}
This is a value-privacy model, not a full-privacy model. It protects amounts while preserving the public verifiability that makes Ethereum useful. For transaction-graph privacy, additional measures (like mixing services or stealth addresses) would be needed on top of FHE.
{% endhint %}

## Trust assumptions

### The relayer and KMS

The relayer provides the FHE infrastructure: encryption, decryption coordination, and transport key pair generation. The Key Management Service (KMS) holds the network's FHE master key and performs re-encryption.

The critical trust property: **the KMS re-encrypts ciphertexts without learning plaintext values.** When a user requests their balance, the KMS transforms the on-chain ciphertext from the network key to the user's public key. The KMS sees ciphertexts in and ciphertexts out — never plaintext.

This is a cryptographic property of the re-encryption scheme, not a policy promise. The KMS cannot extract plaintext from the ciphertexts it processes, assuming the underlying TFHE scheme is secure.

{% hint style="warning" %}
The KMS must be available for decryption to work. If the relayer is down, users cannot read their balances or finalize unshield operations. The on-chain encrypted data remains safe — it is inaccessible without the FHE infrastructure, but also unreadable until the relayer returns.
{% endhint %}

### The blockchain

The on-chain FHE coprocessor (FHEVM) executes homomorphic operations. It must correctly perform encrypted arithmetic for transfers and balance updates. This is part of the blockchain's consensus — nodes verify FHE operations as part of block validation.

### The user's wallet

The wallet signs EIP-712 typed data to authorize FHE operations. The SDK trusts that the wallet correctly implements `eth_signTypedData_v4` and that the signing key is under the user's control. A compromised wallet compromises the FHE session — the attacker could sign authorization requests and decrypt the user's balances.

## Credential storage

### Transport key pair storage

The transport private key is stored in plaintext in the configured storage backend (typically IndexedDB in browsers). There is no encryption-at-rest layer.

| Parameter  | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| Storage    | IndexedDB (browser), memory (tests), AsyncLocalStorage (Node.js) |
| Key format | Plaintext ML-KEM key pair                                        |
| Scope      | One transport key pair per signer address (chain-independent)    |

The security model relies on same-origin isolation: only JavaScript running on the same origin can read IndexedDB. See [Permit Model](./permit-model.md) for the full lifecycle.

### Limitations

<details>
<summary>What same-origin isolation does NOT protect against</summary>

- **Same-origin scripts** — any JavaScript running on the same origin can read IndexedDB. A cross-site scripting (XSS) vulnerability could access the transport private key directly. Reducing XSS surface is essential.
- **Physical device access** — someone with access to the device's file system can read the IndexedDB contents.
- **Malicious browser extensions** — extensions with broad permissions can access IndexedDB. Users should audit their installed extensions.

</details>

## WASM bundle integrity

The TFHE WASM binaries ship **inside the `@fhevm/sdk` npm package** and load from your own bundle — there is no runtime CDN fetch. Integrity is guaranteed the same way as any other dependency: by your package manager's lockfile hashes and your build pipeline.

For advanced deployments that host the WASM assets on a URL instead (via the `runtime` option's `wasmAssetLoadMode` / `locateFile`), the SDK SHA-verifies fetched bytes against hashes pinned in the library before executing them; a hash mismatch always fails initialization rather than falling back.

## Browser security headers

### COOP/COEP headers

Multi-threaded FHE uses `SharedArrayBuffer`, which browsers restrict to cross-origin isolated contexts. To enable multi-threaded encryption, your server must send these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them, `SharedArrayBuffer` is unavailable and the SDK falls back to single-threaded WASM execution — slower, but fully functional. When this happens, `@fhevm/sdk` logs a console warning naming the two headers.

{% hint style="info" %}
These headers are a performance setting, not a hard requirement. Encryption works without them in single-threaded mode. Only enable cross-origin isolation if you want the throughput of multi-threaded FHE.
{% endhint %}

### Content Security Policy (CSP)

The SDK compiles and executes the bundled WASM in the page, and — in multi-threaded mode — spawns its worker pool from embedded source. Your CSP must allow:

| Directive     | Value                | Reason                                                     |
| ------------- | -------------------- | ---------------------------------------------------------- |
| `script-src`  | `'wasm-unsafe-eval'` | Required for WASM compilation and execution                |
| `worker-src`  | `blob:`              | Multi-threaded mode creates its worker pool from blob URLs |
| `connect-src` | your relayer URL     | Encrypt/decrypt requests go to the relayer (or your proxy) |

Example CSP header:

```
Content-Security-Policy: worker-src blob:; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://relayer.testnet.zama.org https://your-relayer-proxy.com;
```

<details>
<summary>Why wasm-unsafe-eval?</summary>

The `wasm-unsafe-eval` directive allows WASM compilation and execution without requiring `unsafe-eval`. It is narrower than `unsafe-eval` — it permits only WebAssembly instantiation, not arbitrary JavaScript `eval()`. All major browsers support it as of 2024.

</details>

## Permit security

### Time-bounded signatures

EIP-712 permit signatures include a start timestamp and duration (in days). The relayer rejects permits outside their validity window. This limits the damage from a leaked permit — it becomes useless after expiry.

Two TTL controls are available:

- `transportKeyPairTTL` — how long the transport key pair remains valid (default: 30 days).
- `permitTTL` — how long signed permits remain valid, in days (default: 30).

### Address-scoped authorization

The EIP-712 typed data includes the wallet address. A permit signed by address A cannot authorize decryption for address B. Combined with contract-scoped authorization (the signed message lists specific contract addresses), each permit is tightly bound to a specific user and set of contracts.

### Revocation

Permits can be revoked programmatically via `sdk.permits.revokePermits()` or automatically via wallet lifecycle events (disconnect, account switch). Revocation removes permits from storage immediately.

After revoking permits, the transport key pair remains in storage. Use `sdk.permits.clear()` to also wipe the key pair.

## CSRF protection

For browser apps, the `web()` transport supports CSRF tokens injected into all mutating HTTP requests to the relayer proxy:

```ts
const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: web({
      security: { getCsrfToken: () => document.cookie.match(/csrf=(\w+)/)?.[1] ?? "" },
    }),
  },
});
```

The token is refreshed before each encrypt/decrypt call. Only POST, PUT, DELETE, and PATCH requests to the relayer URL include the CSRF header. GET requests and non-relayer URLs pass through without modification.

## Summary of cryptographic algorithms

| Operation        | Algorithm       | Key size    | Source                        |
| ---------------- | --------------- | ----------- | ----------------------------- |
| CDN integrity    | SHA-384         | --          | Web Crypto API                |
| FHE encryption   | TFHE            | Network key | WASM (`@zama-fhe/sdk (WASM)`) |
| ZK proofs        | WASM prover     | --          | WASM (`@zama-fhe/sdk (WASM)`) |
| Wallet signing   | ECDSA secp256k1 | 256-bit     | User wallet                   |
| Request tracking | UUID v4         | 128-bit     | `crypto.randomUUID()`         |

## Reporting vulnerabilities

If you discover a security vulnerability in the SDK, report it to **security@zama.ai**. Do not open a public GitHub issue for security reports. See the [Security Policy](https://github.com/zama-ai/sdk/blob/main/SECURITY.md) for full details.
