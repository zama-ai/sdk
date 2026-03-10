---
title: Security Model
description: Threat model, trust assumptions, and security architecture of the Zama SDK.
---

# Security Model

This page describes what the SDK protects, what it exposes, and the trust assumptions underlying its design. Understanding these boundaries helps you make informed decisions about deploying confidential tokens.

## What is encrypted

Confidential tokens encrypt **balances** and **transfer amounts**. When a user shields 1,000 tokens, the plaintext amount is FHE-encrypted client-side before the transaction reaches the blockchain. When a user transfers 500 tokens privately, the amount is encrypted before submission.

The on-chain contract stores FHE ciphertexts instead of `uint256` values. Only the balance owner (via their FHE private key and the relayer KMS) can decrypt their own balance.

## What is visible

FHE protects values, not metadata. The following remain publicly observable on-chain:

- **Transaction existence** — that a transaction occurred is visible in the block.
- **Participant addresses** — sender and receiver addresses are part of the transaction.
- **Token contract address** — which confidential token is involved.
- **Transaction type** — whether the call is a shield, transfer, unshield, or approval.
- **Gas costs** — standard Ethereum gas accounting.
- **Timing** — when transactions occur.

An observer can see that address A sent a confidential transfer to address B on token contract C. They cannot see how much was sent.

{% hint style="info" %}
This is a value-privacy model, not a full-privacy model. It protects amounts while preserving the public verifiability that makes Ethereum useful. For transaction-graph privacy, additional measures (like mixing services or stealth addresses) would be needed on top of FHE.
{% endhint %}

## Trust assumptions

### The relayer and KMS

The relayer provides the FHE infrastructure: encryption, decryption coordination, and keypair generation. The Key Management Service (KMS) holds the network's FHE master key and performs re-encryption.

The critical trust property: **the KMS re-encrypts ciphertexts without learning plaintext values.** When a user requests their balance, the KMS transforms the on-chain ciphertext from the network key to the user's public key. The KMS sees ciphertexts in and ciphertexts out — never plaintext.

This is a cryptographic property of the re-encryption scheme, not a policy promise. The KMS cannot extract plaintext from the ciphertexts it processes, assuming the underlying TFHE scheme is secure.

{% hint style="warning" %}
The KMS must be available for decryption to work. If the relayer is down, users cannot read their balances or finalize unshield operations. The on-chain encrypted data remains safe — it is inaccessible without the FHE infrastructure, but also unreadable until the relayer returns.
{% endhint %}

### The blockchain

The on-chain FHE coprocessor (fhEVM) executes homomorphic operations. It must correctly perform encrypted arithmetic for transfers and balance updates. This is part of the blockchain's consensus — nodes verify FHE operations as part of block validation.

### The user's wallet

The wallet signs EIP-712 typed data to authorize FHE operations. The SDK trusts that the wallet correctly implements `eth_signTypedData_v4` and that the signing key is under the user's control. A compromised wallet compromises the FHE session — the attacker could sign authorization requests and decrypt the user's balances.

## Credential storage security

### Encryption at rest

The FHE private key is encrypted with AES-256-GCM before being written to storage (typically IndexedDB in browsers). The encryption key is derived from the wallet's EIP-712 signature using PBKDF2.

```
EIP-712 signature (raw bytes) ─┐
                                ├──▶ PBKDF2 (600,000 iterations, SHA-256) ──▶ AES-256-GCM key
Wallet address (lowercase)  ───┘     (used as salt)
```

| Parameter     | Value                          |
| ------------- | ------------------------------ |
| KDF           | PBKDF2                         |
| Hash function | SHA-256                        |
| Iterations    | 600,000                        |
| Salt          | Lowercase wallet address       |
| Key length    | 256 bits                       |
| Cipher        | AES-256-GCM                    |
| IV            | 12 random bytes per encryption |

The signature itself is never persisted. It lives only in the in-memory session map, cleared on page reload or revocation. See [Session Model](/concepts/session-model) for the full lifecycle.

### Storage key privacy

Wallet addresses are hashed before use as storage keys:

```
0xAbCd...1234 → toLowerCase → SHA-256 → truncate to 32 hex chars → storage key
```

The storage backend (IndexedDB, memory, or custom) never sees the raw wallet address.

### Limitations

<details>
<summary>What AES-GCM at rest does NOT protect against</summary>

- **Same-origin scripts** — any JavaScript running on the same origin can read IndexedDB. A cross-site scripting (XSS) vulnerability could access the encrypted keypair. The attacker would still need the wallet signature to decrypt it, but reducing XSS surface is essential.
- **Physical device access** — someone with access to the device's file system can read the IndexedDB contents. Again, they need the wallet signature to decrypt, but defense in depth applies.
- **Malicious browser extensions** — extensions with broad permissions can access IndexedDB. Users should audit their installed extensions.

</details>

## WASM bundle integrity

`RelayerWeb` loads the TFHE WASM bundle from Zama's CDN (`cdn.zama.org`). Before execution, the SDK computes a SHA-384 digest of the fetched payload and compares it to a hash pinned in the library's source code.

```
Fetch WASM from CDN → compute SHA-384 → compare to pinned hash → execute or reject
```

If the hashes do not match, initialization fails with a clear error. This protects against CDN compromise or man-in-the-middle injection of modified WASM.

Integrity checking is enabled by default. Disable it only in test environments:

```ts
const relayer = new RelayerWeb({
  // ...
  security: { integrityCheck: false },
});
```

{% hint style="warning" %}
Disabling integrity checks in production removes a critical defense layer. A compromised WASM bundle could exfiltrate FHE private keys or manipulate encrypted values.
{% endhint %}

## Browser security headers

### COOP/COEP headers

Multi-threaded FHE requires `SharedArrayBuffer`, which browsers restrict to cross-origin isolated contexts. Your server must send these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, `SharedArrayBuffer` is unavailable. The SDK falls back to single-threaded WASM execution, which is slower but functional.

{% hint style="info" %}
Single-threaded mode works without COOP/COEP headers. Only enable cross-origin isolation if you need the performance benefit of multi-threaded FHE.
{% endhint %}

### Content Security Policy (CSP)

The Web Worker loads and executes WASM from a CDN. Your CSP must allow:

| Directive     | Value                  | Reason                                        |
| ------------- | ---------------------- | --------------------------------------------- |
| `worker-src`  | `blob:`                | Workers are created from blob URLs            |
| `script-src`  | `'wasm-unsafe-eval'`   | Required for WASM execution inside the worker |
| `connect-src` | `https://cdn.zama.org` | CDN fetch for the WASM bundle                 |

Example CSP header:

```
Content-Security-Policy: worker-src blob:; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://cdn.zama.org https://your-relayer-proxy.com;
```

<details>
<summary>Why wasm-unsafe-eval?</summary>

The `wasm-unsafe-eval` directive allows WASM compilation and execution without requiring `unsafe-eval`. It is narrower than `unsafe-eval` — it permits only WebAssembly instantiation, not arbitrary JavaScript `eval()`. All major browsers support it as of 2024.

</details>

## Session security

### Time-bounded signatures

EIP-712 signatures include a start timestamp and duration. The relayer rejects signatures outside their validity window. This limits the damage from a leaked signature — it becomes useless after expiry.

Two TTL controls are available:

- `keypairTTL` — how long the FHE keypair remains valid (default: 1 day).
- `sessionTTL` — how long the cached wallet signature remains valid (default: 30 days).

### Address-scoped authorization

The EIP-712 typed data includes the wallet address. A signature from address A cannot authorize decryption for address B. Combined with contract-scoped authorization (the signed message lists specific token contracts), each signature is tightly bound to a specific user and set of tokens.

### Revocation

Sessions can be revoked programmatically via `sdk.revokeSession()` or automatically via wallet lifecycle events (disconnect, account switch). Revocation clears the signature from the session map immediately.

After revocation, the encrypted FHE keypair remains in storage. Only the session signature is cleared. The next operation prompts a fresh wallet sign.

## CSRF protection

For browser apps, `RelayerWeb` supports CSRF tokens injected into all mutating HTTP requests to the relayer proxy:

```ts
const relayer = new RelayerWeb({
  security: {
    getCsrfToken: () => document.cookie.match(/csrf=(\w+)/)?.[1] ?? "",
  },
});
```

The token is refreshed before each encrypt/decrypt call. Only POST, PUT, DELETE, and PATCH requests to the relayer URL include the CSRF header. GET requests and non-relayer URLs pass through without modification.

## Summary of cryptographic algorithms

| Operation             | Algorithm           | Key size           | Source                        |
| --------------------- | ------------------- | ------------------ | ----------------------------- |
| Credential encryption | AES-256-GCM         | 256-bit            | Web Crypto API                |
| Key derivation        | PBKDF2-SHA-256      | 600,000 iterations | Web Crypto API                |
| Storage key hashing   | SHA-256 (truncated) | 128-bit output     | Web Crypto API                |
| CDN integrity         | SHA-384             | --                 | Web Crypto API                |
| FHE encryption        | TFHE                | Network key        | WASM (`@zama-fhe/sdk (WASM)`) |
| ZK proofs             | WASM prover         | --                 | WASM (`@zama-fhe/sdk (WASM)`) |
| Wallet signing        | ECDSA secp256k1     | 256-bit            | User wallet                   |
| Request tracking      | UUID v4             | 128-bit            | `crypto.randomUUID()`         |

## Reporting vulnerabilities

If you discover a security vulnerability in the SDK, report it to **security@zama.ai**. Do not open a public GitHub issue for security reports. See the [Security Policy](https://github.com/zama-ai/token-sdk/blob/main/SECURITY.md) for full details.
