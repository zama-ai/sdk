# Fix: Session revocation on account change/disconnect

**Date:** 2026-03-03
**PR:** #25 comment by @ankurdotb

## Problem

`revokeSession()` derives the storage key from `signer.getAddress()` + `chainId` at revoke time. On account change, the signer already reports the **new** address, so revocation deletes the wrong key. The previous account's session signature remains in storage.

**Repro:** A calls `allow()` → user switches to B → auto-revoke deletes `B:chain` (empty) → user switches back to A → stale session for A still present.

## Root Cause

`zama-sdk.ts:55`: `onAccountChange: () => this.revokeSession()` ignores the `newAddress` parameter already provided by the callback signature.

## Design

### 1. Extract `computeStoreKey(address, chainId)` helper

Move the SHA-256 store key derivation out of `CredentialsManager.#storeKey()` into a standalone exported function in `credentials-manager.ts`. The existing `#storeKey()` delegates to it.

```typescript
export async function computeStoreKey(address: string, chainId: number): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
  );
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}
```

### 2. Track last-known identity in `ZamaSDK`

Add `#lastAddress: string | null` and `#lastChainId: number | null` private fields. Initialize eagerly in the constructor by capturing `signer.getAddress()` and `signer.getChainId()` into a deferred promise (constructor can't be async, so store a `Promise` that resolves the identity and await it in the lifecycle callbacks).

### 3. Wire lifecycle callbacks with previous identity

```typescript
onAccountChange: (newAddress) => {
  void this.#revokeByTrackedIdentity().then(() => {
    this.#lastAddress = newAddress.toLowerCase();
  });
},
onDisconnect: () => {
  void this.#revokeByTrackedIdentity().then(() => {
    this.#lastAddress = null;
    this.#lastChainId = null;
  });
},
```

`#revokeByTrackedIdentity()` awaits the identity promise, computes the store key via `computeStoreKey()`, and deletes from session storage directly — no `CredentialsManager` instantiation needed for this path.

### 4. Public `revokeSession()` unchanged

Manual calls still go through `signer.getAddress()` — correct behavior since the user explicitly calls it while the current signer is active.

### 5. Regression test

Test the `A → B → A` scenario:

1. Create SDK with subscribable signer starting as account A
2. Seed session storage with A's session key
3. Trigger `onAccountChange("0xB")`
4. Assert A's session key is deleted
5. Assert B's session key (if any) is untouched
6. Seed B's session key, trigger `onAccountChange("0xA")`
7. Assert B's session key is deleted

## Files Changed

| File                                                | Change                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/sdk/src/token/credentials-manager.ts`     | Extract `computeStoreKey()` export, `#storeKey()` delegates to it            |
| `packages/sdk/src/token/zama-sdk.ts`                | Add identity tracking, `#revokeByTrackedIdentity()`, update lifecycle wiring |
| `packages/sdk/src/token/__tests__/zama-sdk.test.ts` | Add `A→B→A` regression test, disconnect test                                 |

## What doesn't change

- `SignerLifecycleCallbacks` type — already passes `newAddress`
- `GenericSigner` interface — untouched
- Public API surface — no new public methods or types
