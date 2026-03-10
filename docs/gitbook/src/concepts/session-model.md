---
title: Session Model
description: How the SDK manages FHE keypairs, wallet signatures, and session lifecycle.
---

# Session Model

The SDK uses a two-layer authorization model to protect FHE credentials. An FHE keypair is generated once and persisted in encrypted form. A wallet signature — the session — unlocks that keypair for the current browsing session. This separation means the expensive keypair generation happens rarely, while the lightweight signing step repeats once per session.

## The two layers

### Layer 1: FHE keypair (persistent)

The FHE keypair consists of a public key and a private key. The public key is sent to the relayer so it can re-encrypt on-chain ciphertexts. The private key decrypts the re-encrypted values locally. Together, they give a user the ability to read their own confidential balances.

The keypair is generated once and encrypted before storage. It persists across page reloads, browser restarts, and session changes. Regeneration happens only when the keypair expires (controlled by `keypairTTL`).

### Layer 2: Session signature (ephemeral)

The session signature is an EIP-712 typed data signature from the user's wallet. It serves two purposes:

1. **Authorization** — proves the user consents to decrypt balances for specific token contracts.
2. **Key derivation** — the signature's raw bytes are used as input to PBKDF2, producing the AES-GCM key that encrypts and decrypts the FHE private key.

By default, the session signature lives in memory only. It is lost on page reload, tab close, or explicit revocation.

## Lifecycle flow

### First visit

```
User connects wallet
        │
        ▼
SDK generates FHE keypair (via WASM)
        │
        ▼
SDK builds EIP-712 typed data (includes contract addresses, timestamp, duration)
        │
        ▼
Wallet signs EIP-712 → signature
        │
        ├──▶ Derive AES-256-GCM key via PBKDF2 (signature + address as salt)
        │           │
        │           ▼
        │    Encrypt FHE private key → store to IndexedDB
        │
        └──▶ Cache signature in memory (session map)
        │
        ▼
Ready — decrypts reuse cached signature, no further popups
```

### Subsequent page load

```
Page loads
        │
        ▼
SDK loads encrypted keypair from IndexedDB
        │
        ▼
SDK checks session map → empty (memory was cleared)
        │
        ▼
SDK prompts wallet to re-sign EIP-712 → signature
        │
        ├──▶ Derive AES key → decrypt FHE private key
        │
        └──▶ Cache signature in session map
        │
        ▼
Ready — same session, no further popups
```

### Same session (already authorized)

```
Balance request arrives
        │
        ▼
SDK checks session map → signature found
        │
        ▼
Decrypt FHE private key from storage using cached signature
        │
        ▼
Decrypt balance via relayer — no wallet popup
```

## What lives where

| Data                        | Storage location                       | Lifetime                                           | Survives reload?                         |
| --------------------------- | -------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| FHE public key              | Persistent storage (IndexedDB)         | Until `keypairTTL` expires                         | Yes                                      |
| FHE private key (encrypted) | Persistent storage (IndexedDB)         | Until `keypairTTL` expires                         | Yes                                      |
| FHE private key (plaintext) | JavaScript memory only                 | Current decrypt operation                          | No                                       |
| AES-GCM derived key         | JavaScript memory only                 | Current encrypt/decrypt operation                  | No                                       |
| EIP-712 signature           | Session storage (in-memory by default) | Until revoked, tab closed, or `sessionTTL` expires | No (unless using `chromeSessionStorage`) |
| Wallet address hash         | Storage key                            | Matches keypair lifetime                           | Yes                                      |

{% hint style="info" %}
The plaintext FHE private key and the derived AES key exist in memory only for the duration of a single operation. They are not cached or stored anywhere.
{% endhint %}

## TTL: two independent clocks

The SDK has two separate time-to-live settings that control different aspects of the session.

### `keypairTTL` — keypair regeneration

Controls how long the FHE keypair remains valid. Default: 86,400 seconds (1 day).

When the keypair expires:

- A new FHE keypair is generated.
- The wallet is prompted to sign new EIP-712 data.
- The new keypair is encrypted and stored, replacing the old one.

This is the more disruptive expiry — it requires WASM-based key generation.

### `sessionTTL` — re-sign frequency

Controls how long the cached wallet signature remains valid. Default: 2,592,000 seconds (30 days).

When the session expires:

- The cached signature is cleared from session storage.
- A `session:expired` event is emitted.
- The next decrypt prompts a single wallet re-sign.
- The existing FHE keypair is not affected — no regeneration.

{% hint style="info" %}
For high-security contexts, set `sessionTTL: 0` to require a wallet signature on every operation. This provides maximum security at the cost of frequent wallet popups.
{% endhint %}

Each session entry records its TTL at creation time. If you change the `sessionTTL` configuration between sessions, existing sessions use their original TTL, not the new value.

## The allow / revoke flow

### Allow (pre-authorize)

Call `allow()` early — ideally right after wallet connect — to prompt the signature upfront rather than during a balance read.

```
sdk.allow("0xTokenA", "0xTokenB")
        │
        ▼
SDK builds EIP-712 typed data covering both contracts
        │
        ▼
Wallet signs → one signature for all listed contracts
        │
        ▼
Signature cached → all future decrypts for TokenA and TokenB proceed silently
```

A single signature covers all contract addresses passed to `allow()`. The signed EIP-712 message includes the exact set of contracts. If you later call `allow()` with a contract not in the original set, the SDK generates a fresh keypair and requests a new wallet signature.

{% hint style="warning" %}
Batch all token addresses into a single `allow()` call. Each call with a new contract set triggers a new keypair and wallet popup. Plan your allow calls to minimize signing prompts.
{% endhint %}

### Revoke (clear session)

Revocation clears the cached signature. The encrypted keypair in persistent storage is not affected.

```
sdk.revokeSession()
        │
        ▼
Clear signature from session map
        │
        ▼
Next decrypt will prompt wallet to re-sign
```

Three methods exist for different use cases:

- `token.revoke()` — revoke from a specific token instance.
- `sdk.revoke("0xTokenA", "0xTokenB")` — revoke with specific addresses (included in the `credentials:revoked` event).
- `sdk.revokeSession()` — revoke without specifying addresses.

## Wallet lifecycle events

The SDK automatically revokes sessions when wallet state changes. The behavior depends on the event type.

### Disconnect or lock

The user explicitly disconnects or locks their wallet. The session signature is cleared. The next connection requires a fresh sign.

### Account switch

The user switches from address A to address B. The previous account's session is revoked. This happens because the EIP-712 signature is address-scoped — leaving A's session active while B is connected creates confusing UX.

### Chain switch

The user switches networks (e.g., Sepolia to Mainnet) while keeping the same address. Session signatures are **not** revoked. Credentials are keyed by `address + chainId`, so each chain maintains independent sessions. Switching back to the original chain finds the session still active.

```
Address A on Sepolia  → session active
        │
        ▼ (switch to Mainnet)
Address A on Mainnet  → independent session (may need signing)
        │
        ▼ (switch back to Sepolia)
Address A on Sepolia  → original session still active, no re-sign
```

### Automatic vs manual wiring

| Signer         | Auto-revoke                                        | Setup required                                                                             |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `WagmiSigner`  | Built in — subscribes to wagmi's `watchConnection` | None                                                                                       |
| `ViemSigner`   | Manual                                             | Wire `wallet.on("disconnect")` and `wallet.on("accountsChanged")` to `sdk.revokeSession()` |
| `EthersSigner` | Manual                                             | Wire disconnect and account change events to `sdk.revokeSession()`                         |

Without wiring, cached signatures remain valid until TTL expiry. This is not a security vulnerability (signatures are time-bounded and address-scoped), but it creates confusing UX when switching accounts.

## Multi-token batching

A single `allow()` call can cover multiple token contracts:

```ts
await sdk.allow("0xTokenA", "0xTokenB", "0xTokenC");
```

This produces one EIP-712 signature covering all three contracts. The signed message includes the full list of contract addresses, the start timestamp, and the duration. Any `balanceOf` call on TokenA, TokenB, or TokenC reuses the cached signature without additional popups.

The tradeoff: if you later need to add TokenD, the SDK must generate a new keypair and request a fresh signature covering `[A, B, C, D]`. Plan your token set upfront when possible.

## Web extensions

MV3 Chrome extensions run background logic in service workers that Chrome can terminate at any time. The default in-memory session storage is lost on termination.

To solve this, pass `chromeSessionStorage` as the `sessionStorage` option. This uses `chrome.storage.session`, which:

- Survives service worker restarts.
- Is shared across popup, background, and content script contexts.
- Is automatically cleared when the browser closes.

See the [Configuration guide](/guides/configuration#web-extensions) for the full setup.

## Security properties

| Property                | Guarantee                                                                 |
| ----------------------- | ------------------------------------------------------------------------- |
| FHE private key at rest | Encrypted with AES-256-GCM; key derived via PBKDF2 (600,000 iterations)   |
| Signature scope         | Address-scoped and time-bounded via EIP-712                               |
| Signature storage       | In-memory by default; never written to disk                               |
| Storage key privacy     | Wallet addresses are SHA-256 hashed before use as storage keys            |
| Plaintext exposure      | FHE private key exists in plaintext only during active decrypt operations |

For the full threat model and trust assumptions, see the [Security Model](/concepts/security-model).
