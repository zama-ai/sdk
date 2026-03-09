---
title: How FHE Works
description: Fully Homomorphic Encryption for dApp developers — what it is, why it matters for tokens, and how the SDK uses it.
---

# How FHE Works

Fully Homomorphic Encryption (FHE) allows computation on encrypted data without decrypting it first. The result of the computation, once decrypted, matches what you would get from running the same operation on plaintext. This property makes FHE uniquely suited to on-chain privacy: the blockchain can process token balances and transfers while the actual amounts remain hidden.

## What FHE gives you

Standard ERC-20 tokens expose every balance and transfer amount on-chain. Anyone can query a contract's `balanceOf` mapping and see exactly how much every address holds. FHE changes this:

- **Balances are encrypted.** The contract stores FHE ciphertexts instead of plaintext `uint256` values.
- **Transfers operate on ciphertexts.** When you send tokens, the chain subtracts from the sender's encrypted balance and adds to the receiver's encrypted balance — all without seeing the amounts.
- **Only the owner can read their balance.** Decryption requires the owner's FHE private key.

The net result is an ERC-20-compatible token where transaction existence and participant addresses remain public, but amounts stay private.

## The lifecycle of a confidential token operation

A confidential token moves through three phases: shield, operate, and decrypt.

```
Public ERC-20 balance
        │
        ▼
   ┌─────────┐
   │  Shield  │  Encrypt plaintext amount, deposit into confidential contract
   └────┬────┘
        │
        ▼
   ┌──────────────────┐
   │  On-chain FHE ops │  Transfer, approve — all on encrypted data
   └────────┬─────────┘
        │
        ▼
   ┌──────────┐
   │  Decrypt  │  Owner requests their balance via relayer + FHE private key
   └──────────┘
```

### Shielding (public to private)

Shielding converts a public ERC-20 balance into its encrypted form. The SDK encrypts the amount client-side using TFHE WASM, producing an encrypted handle and a zero-knowledge proof that the ciphertext is well-formed. The smart contract verifies this proof on-chain before accepting the deposit.

```
Plaintext amount → TFHE WASM encrypt → { encryptedHandle, inputProof } → on-chain verification
```

### On-chain operations

Once shielded, the contract performs homomorphic arithmetic on the encrypted handles. A confidential transfer subtracts the encrypted amount from one balance and adds it to another. The chain never sees the underlying numbers — it manipulates ciphertexts using FHE operators provided by the [fhEVM](https://docs.zama.ai/fhevm) coprocessor.

### Decryption (reading your balance)

Decryption is a multi-party process. The user's FHE public key is sent to the relayer's Key Management Service (KMS). The KMS re-encrypts the on-chain ciphertext under the user's public key and returns the result. The user's local WASM client then decrypts with their FHE private key.

```
On-chain ciphertext → KMS re-encrypts under user's public key → user decrypts locally with private key
```

At no point does the relayer or the KMS see the plaintext value. The KMS transforms the ciphertext from the network's encryption key to the user's encryption key — a re-encryption step that preserves confidentiality.

### Unshielding (private to public)

Unshielding converts encrypted tokens back to public ERC-20 form. This is a two-step process:

1. **Unwrap** — the user submits an encrypted amount to the contract, which burns the confidential balance and emits a handle for the burn amount.
2. **Finalize** — the SDK requests a public decryption of the burn handle from the relayer KMS. The KMS returns the plaintext value along with a decryption proof. The SDK submits this proof on-chain, and the contract mints the equivalent public ERC-20 tokens.

```
Encrypted balance → unwrap(encryptedAmount) → burn handle emitted
        │
        ▼
KMS public decrypt → { plaintext, decryptionProof }
        │
        ▼
finalizeUnwrap(handle, plaintext, proof) → public ERC-20 tokens minted
```

Public decryption differs from user decryption. It does not use the user's FHE keypair. Instead, the KMS decrypts the value and provides a cryptographic proof that the on-chain contract can verify. This proof ensures the claimed plaintext value matches the ciphertext — no trust in the relayer is required for correctness.

::: tip
The SDK orchestrates both steps in a single `token.unshield()` call. If the page reloads between steps, use `loadPendingUnshield()` and `resumeUnshield()` to pick up where you left off.
:::

## Encrypted handles vs plaintext values

On a standard ERC-20, `balanceOf(address)` returns a `uint256`. On a confidential token, it returns a `bytes32` encrypted handle — a pointer to an FHE ciphertext stored on-chain.

This handle is not the ciphertext itself. It is an identifier that the FHE coprocessor uses to locate the actual encrypted data. To read the plaintext value behind a handle, you must go through the decrypt flow described above.

::: info
A zero handle (`0x000...000`) means no encrypted balance exists. The SDK detects this and skips decryption entirely.
:::

Handles change whenever the underlying encrypted value changes. The SDK uses this property for efficient polling — if the handle has not changed, the balance has not changed, and there is no need to re-decrypt. See [Two-Phase Balance Polling](/concepts/two-phase-polling) for details.

## The relayer

The relayer is the bridge between your dApp and the FHE infrastructure. It provides:

- **Encryption** — generates FHE ciphertexts and zero-knowledge proofs from plaintext inputs.
- **User decryption** — coordinates with the KMS to re-encrypt on-chain ciphertexts under the user's public key.
- **Public decryption** — decrypts values that the contract has marked for public reveal (used in the unshield finalization step).
- **Keypair generation** — creates the FHE keypair that the user needs for decryption.

The SDK communicates with the relayer through a typed message-passing protocol. You never call the relayer directly — the SDK handles all interaction internally.

::: tip
In browser apps, proxy relayer requests through your backend to keep API keys server-side. See the [Configuration guide](/guides/configuration) for setup examples.
:::

## Web Workers and WASM

FHE operations are computationally expensive. Encrypting a single value takes hundreds of milliseconds. To keep the UI responsive, the SDK runs all FHE operations off the main thread:

- **Browser:** `RelayerWeb` spawns a Web Worker that loads TFHE WASM from Zama's CDN. The WASM bundle is verified with a SHA-384 integrity check before execution.
- **Node.js:** `RelayerNode` uses native worker threads with a configurable thread pool.

Communication between the main thread and the worker uses structured cloning with UUID-tracked request/response pairs. Encrypted handles and proofs are transferred via zero-copy `Transferable` objects for performance.

### Multi-threading

By default, the Web Worker runs WASM single-threaded. You can enable parallel FHE operations by passing a `threads` option to `RelayerWeb`. This uses `wasm-bindgen-rayon` and requires `SharedArrayBuffer`, which in turn requires [COOP/COEP headers](/concepts/security-model#copcoep-headers).

::: warning
Multi-threading requires the page to be served with specific security headers. Without them, `SharedArrayBuffer` is unavailable and initialization fails silently with single-threaded fallback. See the [Security Model](/concepts/security-model) for header requirements.
:::

Four to eight threads is the practical sweet spot. Beyond that, diminishing returns set in and memory usage increases on low-end devices.

## The encryption flow in detail

To understand what happens when you call `token.shield(1000n)` or `token.confidentialTransfer(to, 500n)`:

```
Application calls SDK method
        │
        ▼
SDK sends plaintext value to Web Worker via postMessage
        │
        ▼
Worker calls TFHE WASM:
  1. createEncryptedInput(contractAddress, userAddress)
  2. input.add64(amount)
  3. input.encrypt()
        │
        ▼
WASM returns { handles: Uint8Array[], inputProof: Uint8Array }
        │
        ▼
Worker transfers result back to main thread (zero-copy)
        │
        ▼
SDK submits transaction: contract.method(handles[0], inputProof)
        │
        ▼
On-chain InputVerifier contract validates the ZK proof
        │
        ▼
FHE coprocessor processes the encrypted operation
```

The `inputProof` is a zero-knowledge proof generated inside the WASM module. It attests that the encrypted input is well-formed — meaning the ciphertext actually encrypts a valid value. The on-chain `InputVerifier` contract checks this proof before allowing the operation. This prevents malformed ciphertexts from corrupting the encrypted state.

## The decryption flow in detail

When you call `token.balanceOf()`:

```
Application calls balanceOf()
        │
        ▼
SDK reads encrypted handle from contract (standard eth_call)
        │
        ▼
SDK retrieves FHE credentials (publicKey, privateKey, signature)
        │
        ▼
SDK sends decrypt request to Web Worker
        │
        ▼
Worker calls TFHE WASM → WASM sends HTTPS POST to relayer KMS:
  { handles, publicKey, signature }
        │
        ▼
KMS verifies EIP-712 signature
KMS re-encrypts on-chain ciphertext under user's public key
        │
        ▼
WASM receives re-encrypted ciphertext
WASM decrypts locally with user's FHE private key
        │
        ▼
Worker returns plaintext bigint to main thread
        │
        ▼
Application receives the balance
```

The critical security property: the KMS performs re-encryption, not decryption-then-re-encryption. It never holds the plaintext value. The transformation is purely cryptographic — from one ciphertext to another.

## What the SDK abstracts

The SDK handles the full FHE lifecycle so your application code stays simple:

| Concern              | What the SDK does                                                   |
| -------------------- | ------------------------------------------------------------------- |
| Keypair management   | Generates, encrypts, persists, and loads FHE keypairs automatically |
| Wallet authorization | Prompts EIP-712 signatures, caches them for the session             |
| Encryption           | Converts plaintext amounts to FHE ciphertexts with ZK proofs        |
| Decryption           | Coordinates with the relayer KMS, decrypts locally                  |
| Threading            | Runs all FHE operations in a Web Worker or thread pool              |
| Integrity            | Verifies WASM bundles via SHA-384 before execution                  |

For the cryptographic details of credential storage and key derivation, see the [Security Model](/concepts/security-model). For session lifecycle and wallet integration, see [Session Model](/concepts/session-model).

## Further reading

- [Zama's fhEVM documentation](https://docs.zama.ai/fhevm) — the on-chain FHE protocol that confidential tokens use
- [TFHE deep dive](https://www.zama.ai/post/tfhe-deep-dive-part-1) — the encryption scheme under the hood
- [Configuration guide](/guides/configuration) — set up the relayer, signer, and storage
