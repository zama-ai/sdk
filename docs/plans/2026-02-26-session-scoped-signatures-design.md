# Session-Scoped Signatures

## Problem

The EIP-712 wallet signature is stored in plaintext in IndexedDB alongside encrypted credentials. This signature serves as both:

1. An authorization token (proves wallet consent to the relayer)
2. PBKDF2 key material for encrypting the FHE private key at rest

Anyone with devtools access, a browser extension, or an XSS vector can grab the plaintext signature, derive the AES key, and decrypt the FHE private key — giving them access to all encrypted balances.

## Solution

Remove the signature from persistent storage entirely. Keep it in-memory only for the duration of a page session. The encrypted FHE private key remains in IndexedDB (protected by AES-GCM), but unlocking it requires a wallet re-sign once per session.

## Approach: Session map in CredentialsManager

All changes are scoped to `CredentialsManager`. No changes to `ReadonlyToken`, `Token`, worker layer, or relayer.

### Storage format

`EncryptedCredentials` drops the `signature` field:

```ts
interface EncryptedCredentials {
  publicKey: string;
  encryptedPrivateKey: EncryptedData;
  contractAddresses: Address[];
  startTimestamp: number;
  durationDays: number;
}
```

### Session state

```ts
#sessionSignatures: Map<string, string> = new Map();
// key = storeKey (hashed address), value = EIP-712 signature
```

### Flow changes

**`create()`**: After wallet signs, persist `EncryptedCredentials` without signature, cache signature in `#sessionSignatures`.

**`get()`/`getAll()`**: Load from storage, check session map for signature. If present, decrypt and return. If missing, prompt wallet re-sign using stored EIP-712 parameters, cache in session map, then decrypt.

**`isExpired()`**: Check timestamp-based expiry without needing the signature. Only needs the signature to decrypt the private key, which isn't required for expiry checks.

### New public API

```ts
lock(): void
// Clear session signature. Stored credentials remain, next decrypt triggers re-sign.

async unlock(contractAddresses?: Address[]): Promise<void>
// Pre-authorize: prompt wallet sign and cache session signature.

async isUnlocked(): Promise<boolean>
// Whether a session signature is currently cached.
```

### Migration

Existing stored credentials with a `signature` field are silently migrated:

- On load, if `signature` exists, use it to decrypt + cache in session map, then re-persist without it
- If `signature` is missing, use new format — check session map

### Events

- `CredentialsLocked` — emitted on `lock()`
- `CredentialsUnlocked` — emitted when session signature is cached

### What doesn't change

- `StoredCredentials` type (consumers still get signature in memory)
- `ReadonlyToken` / `Token` (call `credentials.get()` as before)
- `UserDecryptParams` (still receives signature, sourced from memory)
- Worker/relayer layer (untouched)
- AES-GCM encryption scheme (same PBKDF2 derivation)

### Trade-offs

- **UX cost**: One wallet popup per session (page load). Standard for dApps.
- **No cross-tab sharing**: Each tab has its own session. Acceptable since each tab already has its own SDK instance.
- **Instance lifetime**: If `CredentialsManager` is recreated, session is lost. In practice it's a singleton per token/SDK instance.
