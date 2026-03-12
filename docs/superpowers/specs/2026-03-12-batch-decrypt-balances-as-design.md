# Batch Delegated Decryption Design

## Problem

`decryptBalanceAs` generates a fresh keypair, creates a delegated EIP-712, and signs it on every call. This is prohibitively expensive for service providers like Dfns who need to decrypt balances for many delegators across many tokens. There is no batch method for delegated decryption, and no credential caching.

## Use Case

Dfns (delegate `0xBBBB`) has delegation rights from multiple users for multiple tokens:

```
Guillaume (0xAAAA) → Dfns for cUSDT, cUSDC
Corentin  (0xCCCC) → Dfns for cUSDT, cUSDC
Ankur     (0xDDDD) → Dfns for cUSDT, cUSDC
```

Dfns wants to:

1. Sign once per delegator (not once per token, not once per call)
2. Batch decrypt all tokens for a given delegator in parallel
3. Reuse credentials across calls within a configurable session window

Two levels of batching:

- **Level 1 (across delegators)**: Dfns iterates themselves — no SDK method needed
- **Level 2 (across tokens per delegator)**: SDK provides `batchDecryptBalancesAs`

## Design

### 1. `DelegatedCredentialsManager`

New class: `packages/sdk/src/token/delegated-credentials-manager.ts`

Mirrors `CredentialsManager` but for delegated decryption credentials.

**Config:**

```ts
interface DelegatedCredentialsManagerConfig {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  keypairTTL?: number; // seconds, default 86400 (1 day)
  sessionTTL?: number; // seconds, default 2592000 (30 days)
  onEvent?: ZamaSDKEventListener;
}
```

Same shape as `CredentialsManagerConfig`. Caller constructs one instance and passes it around.

**Store key:** `hash(delegateAddress, delegatorAddress, chainId)` — one credential set per delegator.

**EIP-712:** Uses `relayer.createDelegatedUserDecryptEIP712(publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays)` instead of `createEIP712`.

**Stored credentials type:**

```ts
interface DelegatedStoredCredentials extends StoredCredentials {
  delegatorAddress: Address;
  delegateAddress: Address;
}
```

**Public API:**

| Method                                          | Description                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `allow(delegatorAddress, ...contractAddresses)` | Returns cached or fresh `DelegatedStoredCredentials`. Extends contract set if needed.                             |
| `isExpired(delegatorAddress, contractAddress?)` | Whether stored credentials for this delegator are expired or missing coverage.                                    |
| `revoke(delegatorAddress)`                      | Clears the session signature for this delegator. Next call to `allow` re-signs but reuses keypair if still valid. |
| `clear(delegatorAddress)`                       | Deletes all stored credentials for this delegator.                                                                |
| `isAllowed(delegatorAddress)`                   | Whether a session signature is cached and valid for this delegator.                                               |

**Caching behavior:** Same as `CredentialsManager`:

- Keypair persisted with AES-GCM encryption (key derived from wallet signature via PBKDF2)
- Session signature stored separately with TTL
- Contract set auto-extended when new tokens are added (re-sign, reuse keypair)
- Stale credentials detected via `keypairTTL`, session expiry detected via `sessionTTL`

### 2. `ReadonlyToken.batchDecryptBalancesAs` (static method)

New static method mirroring `batchDecryptBalances`.

**Signature:**

```ts
interface BatchDecryptAsOptions {
  /** The address of the account that delegated decryption rights. */
  delegatorAddress: Address;
  /** Credential manager for caching delegated credentials. */
  credentials: DelegatedCredentialsManager;
  /** Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. */
  handles?: Handle[];
  /** Balance owner address. Defaults to the delegator address. */
  owner?: Address;
  /** Called when decryption fails for a single token. Return a fallback bigint. */
  onError?: (error: Error, address: Address) => bigint;
  /** Maximum number of concurrent decrypt calls. Default: Infinity. */
  maxConcurrency?: number;
}

static async batchDecryptBalancesAs(
  tokens: ReadonlyToken[],
  options: BatchDecryptAsOptions,
): Promise<Map<Address, bigint>>
```

**Flow:**

1. Resolve owner (default to `delegatorAddress`)
2. Fetch handles for uncached tokens in parallel
3. Parallel cache lookups via `loadCachedBalance` (keyed by owner)
4. `credentials.allow(delegatorAddress, ...uncachedTokenAddresses)` — single sign covering all tokens
5. Parallel `relayer.delegatedUserDecrypt(...)` per uncached token, bounded by `maxConcurrency`
6. Cache decrypted values via `saveCachedBalance`
7. Collect errors via `onError` callback or aggregate and throw

This mirrors `batchDecryptBalances` exactly, replacing:

- `credentials.allow(...)` with `credentials.allow(delegatorAddress, ...)`
- `relayer.userDecrypt(...)` with `relayer.delegatedUserDecrypt(...)`
- `signerAddress` with `delegatorAddress` + `delegateAddress`

### 3. `ReadonlyToken.decryptBalanceAs` update

Add optional `credentials` parameter to the existing method:

```ts
async decryptBalanceAs({
  delegatorAddress,
  owner?,
  credentials?,  // optional DelegatedCredentialsManager
}): Promise<bigint>
```

**When `credentials` is provided:**

- Call `credentials.allow(delegatorAddress, this.address)` to get cached/fresh creds
- Use those creds for `relayer.delegatedUserDecrypt(...)`
- Skip inline keypair generation, EIP-712 creation, and signing

**When `credentials` is omitted:**

- Current behavior unchanged (fresh keypair + EIP-712 + signature every call)

### 4. React SDK hooks

**Update `useDecryptBalanceAs`:**

- Add optional `credentials: DelegatedCredentialsManager` to the hook config
- Pass through to `decryptBalanceAs`

**New `useBatchDecryptBalancesAs` hook:**

- Thin wrapper around `ReadonlyToken.batchDecryptBalancesAs`
- Accepts `tokenAddresses: Address[]`, `delegatorAddress`, `credentials`
- Returns standard mutation state (`mutate`, `data`, `isSuccess`, etc.)

### 5. Exports

- `DelegatedCredentialsManager` and `DelegatedCredentialsManagerConfig` exported from `@zama-fhe/sdk`
- `BatchDecryptAsOptions` exported from `@zama-fhe/sdk`
- `useBatchDecryptBalancesAs` exported from `@zama-fhe/react-sdk`

### 6. Dfns usage example

```ts
import { DelegatedCredentialsManager, ReadonlyToken } from "@zama-fhe/sdk";

// Dfns creates one manager at startup — shared across all delegators
const delegatedCreds = new DelegatedCredentialsManager({
  relayer,
  signer: dfnsSigner, // Dfns's signer (0xBBBB)
  storage: persistentStorage, // IndexedDB, etc.
  sessionStorage: sessionStore,
  keypairTTL: 86400 * 365, // 1 year
  sessionTTL: Infinity, // never expire session
});

// Dfns iterates their customers (level 1 — no SDK method needed)
for (const delegator of [guillaume, corentin, ankur]) {
  // Level 2: batch decrypt all tokens for this delegator
  const balances = await ReadonlyToken.batchDecryptBalancesAs([cUSDT, cUSDC], {
    delegatorAddress: delegator,
    credentials: delegatedCreds,
  });
  // First call for each delegator: generates keypair + signs once
  // Subsequent calls: hits cache, no signing
}
```

## Out of scope

- Level-1 batching across delegators — Dfns loops themselves
- Changes to `CredentialsManager` — completely separate class
- Changes to the relayer interface — `delegatedUserDecrypt` and `createDelegatedUserDecryptEIP712` already exist
- Changes to delegation grant/revoke methods
