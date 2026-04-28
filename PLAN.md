# Credentials System Replacement — Implementation Plan

> SDK-89. Hot-swap the current credentials system with a correctly modeled one.
> This plan describes services, responsibilities, interfaces, and interactions. It intentionally leaves implementation details to the implementer.

---

## 1. What Gets Deleted

The entire current credentials system:

- `credentials-manager-base.ts` — base class with the fused keypair+permit state machine
- `credentials-manager.ts` — standard credentials
- `delegated-credentials-manager.ts` — parallel delegated flow
- `credential-crypto.ts` — AES-GCM encryption of private key using permit-derived entropy
- `credential-validation.ts` — `computeStoreKey`, `isTimeValid`, `coversContracts` helpers
- `session-signatures.ts` — TTL-aware session signature cache
- Related type definitions (`StoredCredentials`, `DelegatedStoredCredentials`, etc.)
- All credential-related exports from `index.ts`

The `DecryptCache` is **not** touched — it stays as-is.

---

## 2. New Components

### 2.1 CredentialService

**Role:** Single facade that ZamaSDK holds. Owns the KeypairVault and PermissionStore. Orchestrates all credential operations.

**Dependencies (injected via interfaces, not concrete classes):**

```
KeypairGenerator
  generateKeypair() → { publicKey, privateKey }

PermitFactory
  createPermit(params) → EIP712TypedData
  createDelegatedPermit(params) → EIP712TypedData

PermitSigner
  signTypedData(typedData) → Hex (the permit signature)
  getAddress() → Address
  getChainId() → number
```

ZamaSDK is the composition root — it maps its existing `relayer` to `KeypairGenerator` + `PermitFactory`, and its `signer` to `PermitSigner`. The CredentialService never imports `RelayerDispatcher` or `GenericSigner`.

**Configuration:**

- `permitDuration: number` — days, default 30, used as `durationDays` when creating new permits
- `storage: GenericStorage` — backing store for keypairs and permissions. ZamaSDK passes the configured storage (same `GenericStorage` interface used elsewhere in the SDK). Credentials and `DecryptCache` data live in independent namespaces under the same storage.

**Lifecycle:**

- Created by ZamaSDK when a signer is present
- On creation: hydrates from storage (prune expired permissions), then eagerly initializes the keypair (see KeypairVault below)
- ZamaSDK calls `handleIdentityChange(prev, next)` on signer/chain changes — the service does NOT subscribe to identity events itself

**Public interface:**

```
initialize(signer) → Promise<void>
  Hydrate from storage. Eagerly generates keypair for this signer via the vault
  (or restores it from storage if already persisted).

allow(contracts, delegator?) → Promise<AllowResult>
  1. await vault.get(signer) → keypair (always ready, may await in-flight generation)
  2. determine scope: (signerAddress, chainId, keypairPublicKey, delegator ?? signerAddress)
  3. list permissions from store for this scope, prune expired
  4. check which contracts are already covered
  5. if fully covered → return existing keypair + permissions, no wallet prompt
  6. if uncovered contracts → create new permission(s):
     - chunk uncovered into groups of 10 (protocol max)
     - for each chunk: create permit via PermitFactory → sign via PermitSigner → store
     - each permission is stored individually after successful signing
       (partial success is kept — if user rejects 2nd prompt, 1st permission survives)
  7. return AllowResult { keypair, permissions[] }

isAllowed(contracts, delegator?) → Promise<boolean>
  Pure store lookup. List permissions for scope, prune expired,
  check if union of all signedContractAddresses covers all requested contracts.

revokePermits() → Promise<void>
  Delete all permissions for current (signer, chainId).
  Keypair survives. Next allow() will re-prompt.

clearCredentials() → Promise<void>
  Wipe keypair for current signer.
  Cascade: wipe all permissions across ALL chains bound to that keypair.
  Next allow() generates fresh keypair + permit.

handleIdentityChange(prev, next) → Promise<void>
  If signer address changed → clearCredentials() for prev signer,
    then initialize() for new signer (eager keypair generation).
  If only chain changed → no-op (keypair is chain-independent,
    permissions are naturally scoped by chainId).
```

**`AllowResult` (internal, never exported):**

```
{
  keypair: { publicKey, privateKey, signerAddress }
  permissions: Permission[]
}
```

### 2.2 KeypairVault

**Role:** Manages one ML-KEM ephemeral keypair per signer. Chain-independent.

**Storage:** Backed by `GenericStorage`. One keypair per signer address. On `initialize`, the vault attempts to restore a persisted keypair before generating a new one. On generation or deletion, changes are written through to storage.

**Behavior:**

- On `initialize(signer)`: check storage for a persisted keypair → if found, restore into memory. If not, call `KeypairGenerator.generateKeypair()`, store the result in memory and persist to storage. Store the **promise**, not just the resolved value.
- `get(signer)` → returns the keypair if ready, or awaits the in-flight generation promise if still pending. Never returns null once initialized.
- `delete(signer)` → wipes keypair from memory and storage.
- `regenerate(signer)` → delete + initialize. Used for corruption recovery.

**Key design points:**

- The private key is stored **in plaintext** — both in memory and in the backing storage. The SDK does not wrap or encrypt the private key. The consumer is responsible for choosing a storage backend with appropriate security properties for their context (browser IndexedDB behind OS-level encryption, platform keychain, KMS-backed store, etc.). See §3 for the full rationale.
- The `publicKey` is stored explicitly alongside the `privateKey` — the KMS API cannot derive one from the other.

### 2.3 PermissionStore

**Role:** Stores permissions (signed permits + metadata). Supports multiple permissions per scope.

**Storage:** Backed by `GenericStorage`. Each scope maps to a `Permission[]` array. All mutations are written through to storage.

**Storage key scheme:** One key per scope → `Permission[]` array as value.

A scope is: `(signerAddress, chainId, keypairPublicKey, delegatorAddress)`.
For direct (non-delegated) permissions: `delegatorAddress === signerAddress`.

**Permission record:**

```
{
  permit: Hex                        — the EIP-712 signature
  signedContractAddresses: Address[] — sorted, checksummed, max 10
  startTimestamp: number
  durationDays: number
}
```

**Operations:**

```
list(scope) → Permission[]
  Read array from storage. Prune any expired permissions before returning.
  (expired = now > startTimestamp + durationDays * 86400)

add(scope, permission) → void
  Read-modify-write: append to array, write back.

deleteScope(scope) → void
  Delete the key entirely. Used by revokePermits().

deleteByKeypair(keypairPublicKey) → void
  Delete all scopes that reference this keypair. Used by clearCredentials().
  This is a scan over all keys — acceptable given small cardinality.
```

**Key design points:**

- Writes are atomic at the storage level — the entire array is written in one `set()` call.
- No widening, merging, or rewriting of existing permissions in the foundation ticket. Permissions accumulate. Only removed by expiration, revoke, or clear.
- The number of permissions per scope is small (bounded by protocol constraints + app contract count). The array read-modify-write is fine.

---

## 3. Storage Strategy

### 3.1 Design Principle: Delegated Security

The SDK does **not** encrypt credentials at its own layer. The old system derived an AES key from the permit signature (PBKDF2), but the signature was stored alongside the encrypted data — lock and key in the same drawer. Removing this is correct, and the replacement is not "better SDK-layer encryption" but rather: **the consumer provides a storage backend with the security properties they need.**

| Context          | Storage backend              | Security boundary                          |
| ---------------- | ---------------------------- | ------------------------------------------ |
| Browser dApp     | IndexedDB (default)          | OS-level disk encryption + browser sandbox |
| Native mobile    | Platform keychain            | OS keychain / keystore                     |
| Server / custody | KMS-backed store, Vault, HSM | Operator infrastructure                    |
| CLI / local dev  | Filesystem                   | Developer responsibility                   |

The SDK's `GenericStorage` interface is the integration point. Consumers who need stronger at-rest protection provide a storage implementation that wraps encryption (e.g., an adapter that encrypts before writing to IndexedDB).

### 3.2 Namespacing

Credentials (keypairs + permissions) and `DecryptCache` live in **independent namespaces** under the same `GenericStorage` instance. Key prefixes prevent collisions:

- Keypair: `zama:keypair:<signerAddress>`
- Permissions: `zama:perms:<scopeHash>`
- DecryptCache: `zama:cache:...` (unchanged)

### 3.3 Future: Optional `derivationSecret` Wrapping

A later ticket (SDK-135) adds optional at-rest wrapping for contexts where the storage backend is not inherently secure (headless CLI, bare-metal agents). The consumer provides a `derivationSecret` in config; the SDK derives `HKDF(derivationSecret, walletAddress) → AES-256-GCM key` and wraps the private key before writing to storage. This does not eliminate storage — it eliminates the requirement for **secure** storage.

This is additive: the `KeypairVault` and `PermissionStore` interfaces are unchanged. The wrapping is applied transparently at the storage write/read boundary.

---

## 4. ZamaSDK Wiring Changes

### 4.1 Construction

```
if signer:
  this.credentialService = new CredentialService({
    keypairGenerator: relayer,          // relayer satisfies KeypairGenerator
    permitFactory: relayer,             // relayer satisfies PermitFactory
    permitSigner: signer,              // signer satisfies PermitSigner
    permitDuration: config.permitDuration ?? 30,
    storage: config.storage,            // GenericStorage instance
  })
  await this.credentialService.initialize(signer)
```

The `credentials` and `delegatedCredentials` fields are removed. One `credentialService` field replaces both.

### 4.2 `sdk.allow(contracts)`

```
credentialService.allow(contracts) → AllowResult (discarded)
```

Public return type remains `Promise<void>`.

### 4.3 `sdk.allowAs(delegator, contracts)`

```
credentialService.allow(contracts, delegator) → AllowResult (discarded)
```

### 4.4 `sdk.userDecrypt(handles)`

```
result = credentialService.allow(contractAddresses)
group handles by matching permission (which permission covers which contract)
relayer.userDecrypt({
  handles,
  contractAddress,
  signedContractAddresses: permission.signedContractAddresses,
  privateKey: result.keypair.privateKey,
  publicKey: result.keypair.publicKey,
  signature: permission.permit,
  signerAddress: result.keypair.signerAddress,
  startTimestamp: permission.startTimestamp,
  durationDays: permission.durationDays,
}) per permission group
```

The decrypt cache interaction is unchanged — ZamaSDK still probes the cache before calling into the credential service, and writes results to the cache after.

### 4.5 `sdk.revokePermits()`

```
credentialService.revokePermits()
cache.clearForRequester(signerAddress)    // ZamaSDK coordinates cache clearing
```

### 4.6 `sdk.clearCredentials()`

```
credentialService.clearCredentials()
cache.clearForRequester(signerAddress)
```

### 4.7 Identity change handler

```
credentialService.handleIdentityChange(prev, next)
cache.clearForRequester(prev.address)     // if signer changed
relayer switch chain                       // unchanged
notify identity listeners                  // unchanged
```

### 4.8 `sdk.isAllowed(contracts)` / `sdk.isAllowedAs(delegator, contracts)`

```
credentialService.isAllowed(contracts)
credentialService.isAllowed(contracts, delegator)
```

---

## 5. Token Wiring Changes

`ReadonlyToken` and `Token` call through `this.sdk` — they never hold credentials directly. Changes are minimal:

- `token.allow()` → `sdk.allow([this.address])` — unchanged
- `token.balanceOf()` → `sdk.userDecrypt(...)` — unchanged
- `token.isAllowed()` → `sdk.isAllowed([this.address])` — unchanged
- `token.revoke()` → needs revisiting. Today it revokes for specific contracts. In the new model, `revokePermits()` revokes all for the current chain. Either: remove per-contract revocation (simplest), or add a `revokePermits(contracts?)` optional filter later.
- `token.decryptBalanceAs(...)` → `sdk.userDecryptAs(delegator, handles)` — wiring change to use unified path instead of reaching into `delegatedCredentials` directly
- `ReadonlyToken.batchDecryptBalancesAs(...)` → same: use `sdk.allowAs()` + `sdk.userDecryptAs()` instead of `delegatedCredentials.allow()` + `relayer.delegatedUserDecrypt()` directly

---

## 6. Public Export Changes

**Removed from exports:**

- `CredentialsManager`
- `DelegatedCredentialsManager`
- `BaseCredentialsManager`
- `StoredCredentials`, `DelegatedStoredCredentials`
- `CredentialsConfig`, `DelegatedCredentialsManagerConfig`
- Any session signature types

**Not exported (internal only):**

- `CredentialService`
- `KeypairVault`
- `PermissionStore`
- `AllowResult`, `Permission`, `PermissionScope`
- `KeypairGenerator`, `PermitFactory`, `PermitSigner` interfaces

**Config changes:**

- Remove `keypairTTL`, `sessionTTL`, `sessionStorage` from `ZamaSDKConfig`
- Add `permitDuration?: number` (days, default 30)
- `storage` is used for both `DecryptCache` and credentials (independent namespaces)

---

## 7. What's NOT Changing

- `DecryptCache` — stays as-is, separate epic
- `RelayerDispatcher` / relayer workers — untouched, CredentialService uses them via interfaces
- `GenericSigner` / signer adapters — untouched
- `GenericStorage` / storage implementations — untouched, credentials use the same interface
- React-sdk hooks — they call through `sdk.*` methods, so they work once the SDK surface is compatible
- Event system — no credential events in this epic
- `FheArtifactCache` — unrelated

---

## 8. Implementation Order (Sub-Issues)

1. **SDK-134: Foundation + persistence** — `KeypairVault`, `PermissionStore`, `CredentialService` with `GenericStorage` backing. Wire into ZamaSDK, update Token wiring, delete old system. Credentials persist across reloads. No encryption wrapping — consumer owns storage security.

2. **SDK-136: Widen permits on overlap** — When `allow()` resolves uncovered contracts, prefer widening an existing permission (union ≤ 10) to creating a new one. Planning improvement inside `CredentialService.allow`.

3. **SDK-137: KMS context rotation recovery** — When `userDecrypt` fails due to stale KMS context, invalidate the permission, re-run `allow`, retry once.

4. **SDK-135: Optional `derivationSecret` wrapping** — For headless/CLI contexts where the storage backend is not inherently secure. `HKDF(derivationSecret, walletAddress) → AES-256-GCM` wraps the private key at the storage boundary. Additive — no interface changes.

5. **SDK-139: Documentation** — Single pass over all consumer-facing docs to reflect the new credentials model.
