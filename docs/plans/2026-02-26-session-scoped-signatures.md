# Session-Scoped Signatures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the EIP-712 signature from persistent storage and hold it in-memory only, requiring one wallet re-sign per session.

**Architecture:** Add a `Map<storeKey, string>` to `CredentialsManager` for session signatures. Remove `signature` from `EncryptedCredentials`. On cache hit without session signature, re-sign via wallet. Expose `lock()`/`unlock()`/`isUnlocked()` public API. Silent migration for existing stored data.

**Tech Stack:** TypeScript, Vitest, Web Crypto API (existing AES-GCM/PBKDF2)

---

### Task 1: Add new events to sdk-events.ts

**Files:**

- Modify: `packages/sdk/src/events/sdk-events.ts`

**Step 1: Add the two new event constants and types**

Add to `ZamaSDKEvents` object:

```ts
CredentialsLocked: "credentials:locked",
CredentialsUnlocked: "credentials:unlocked",
```

Add event interfaces:

```ts
export interface CredentialsLockedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsLocked;
}

export interface CredentialsUnlockedEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.CredentialsUnlocked;
}
```

Add both to the `ZamaSDKEvent` union type.

**Step 2: Run type check**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add packages/sdk/src/events/sdk-events.ts
git commit -m "feat: add CredentialsLocked/Unlocked events"
```

---

### Task 2: Update EncryptedCredentials and validation

**Files:**

- Modify: `packages/sdk/src/token/credential-manager.ts`

**Step 1: Write the failing test — validation accepts credentials without signature**

In `packages/sdk/src/token/__tests__/credentials-manager.test.ts`, add:

```ts
it("loads credentials stored without signature field (new format)", async () => {
  // Create credentials to get valid encrypted data
  const creds = await manager.get("0xtoken" as Address);

  // Read stored data and strip the signature field (simulate new format)
  const stored = await store.getItem(storeKey);
  const parsed = JSON.parse(stored!);
  delete parsed.signature;
  await store.setItem(storeKey, JSON.stringify(parsed));

  // New manager instance should re-sign and return valid credentials
  const manager2 = new CredentialsManager({
    sdk: sdk as unknown as RelayerSDK,
    signer,
    storage: store,
    durationDays: 1,
  });
  const creds2 = await manager2.get("0xtoken" as Address);

  // Should have re-signed (1 original + 1 re-sign)
  expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  expect(creds2.privateKey).toBe("0xpriv456");
  expect(creds2.signature).toBe("0xsig789");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: FAIL — `#assertEncryptedCredentials` rejects missing `signature`

**Step 3: Update EncryptedCredentials interface and validation**

In `credential-manager.ts`:

1. Remove `signature` from `EncryptedCredentials` — it now extends `Omit<StoredCredentials, "privateKey" | "signature">`:

```ts
interface EncryptedCredentials extends Omit<StoredCredentials, "privateKey" | "signature"> {
  encryptedPrivateKey: EncryptedData;
}
```

2. Add a legacy interface for migration:

```ts
interface LegacyEncryptedCredentials extends EncryptedCredentials {
  signature: string;
}
```

3. Update `#assertEncryptedCredentials` — remove the `assertString(data.signature, ...)` line. Add a separate type guard for legacy data:

```ts
#assertEncryptedCredentials(data: unknown): asserts data is EncryptedCredentials {
  assertObject(data, "Stored credentials");
  assertString(data.publicKey, "credentials.publicKey");
  assertArray(data.contractAddresses, "credentials.contractAddresses");
  assertObject(data.encryptedPrivateKey, "credentials.encryptedPrivateKey");
  assertString(data.encryptedPrivateKey.iv, "encryptedPrivateKey.iv");
  assertString(data.encryptedPrivateKey.ciphertext, "encryptedPrivateKey.ciphertext");
}

#hasLegacySignature(data: EncryptedCredentials): data is LegacyEncryptedCredentials {
  return "signature" in data && typeof (data as Record<string, unknown>).signature === "string";
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: Still FAIL — the re-sign flow isn't implemented yet. But the validation assertion error should be gone. The test will now fail on a different line (trying to decrypt without a session signature).

**Step 5: Commit**

```bash
git add packages/sdk/src/token/credential-manager.ts packages/sdk/src/token/__tests__/credentials-manager.test.ts
git commit -m "refactor: remove signature from EncryptedCredentials, add legacy migration guard"
```

---

### Task 3: Implement session signature map and re-sign flow

**Files:**

- Modify: `packages/sdk/src/token/credential-manager.ts`

**Step 1: Add session map and update create()**

Add private field:

```ts
#sessionSignatures: Map<string, string> = new Map();
```

In `create()`, after `const signature = await this.#signer.signTypedData(eip712)`:

- Cache signature: `this.#sessionSignatures.set(await this.#storeKey(), signature)`

In `#encryptCredentials()`, update to not include `signature` in the returned object (it already doesn't since we changed the interface — just verify the spread `{ privateKey: _, ...rest }` no longer includes it since `StoredCredentials` still has `signature`. We need to explicitly exclude it):

```ts
async #encryptCredentials(creds: StoredCredentials): Promise<EncryptedCredentials> {
  const address = (await this.#signer.getAddress()).toLowerCase();
  const encryptedPrivateKey = await this.#encrypt(creds.privateKey, creds.signature, address);
  const { privateKey: _, signature: _sig, ...rest } = creds;
  return { ...rest, encryptedPrivateKey };
}
```

**Step 2: Update getAll() to use session signature or re-sign**

Replace the current `getAll()` body after loading/validating stored credentials. The key change is in the successful cache-hit path:

```ts
async getAll(contractAddresses: Address[]): Promise<StoredCredentials> {
  const storeKey = await this.#storeKey();
  this.#emit({ type: ZamaSDKEvents.CredentialsLoading, contractAddresses });
  try {
    const stored = await this.#storage.getItem(storeKey);
    if (stored) {
      const encrypted = JSON.parse(stored) as unknown;
      this.#assertEncryptedCredentials(encrypted);

      // Migration: if legacy format has signature, use it and cache in session
      if (this.#hasLegacySignature(encrypted)) {
        const creds = await this.#decryptCredentials(encrypted, encrypted.signature);
        if (this.#isValid(creds, contractAddresses)) {
          this.#sessionSignatures.set(storeKey, encrypted.signature);
          // Re-persist without signature (migration)
          const migrated = await this.#encryptCredentials(creds);
          await this.#storage.setItem(storeKey, JSON.stringify(migrated)).catch(() => {});
          this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
          return creds;
        }
        this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
      } else {
        // New format: check session map
        const sessionSig = this.#sessionSignatures.get(storeKey);
        if (sessionSig) {
          const creds = await this.#decryptCredentials(encrypted, sessionSig);
          if (this.#isValid(creds, contractAddresses)) {
            this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
            return creds;
          }
          this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
        } else {
          // No session signature — need to re-sign
          if (this.#isValidWithoutDecrypt(encrypted, contractAddresses)) {
            const signature = await this.#reSign(encrypted);
            this.#sessionSignatures.set(storeKey, signature);
            const creds = await this.#decryptCredentials(encrypted, signature);
            this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
            return creds;
          }
          this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
        }
      }
    }
  } catch {
    try { await this.#storage.removeItem(storeKey); } catch { /* best effort */ }
  }

  const key = contractAddresses.slice().sort().join(",");
  if (!this.#createPromise || this.#createPromiseKey !== key) {
    this.#createPromiseKey = key;
    this.#createPromise = this.create(contractAddresses).finally(() => {
      this.#createPromise = null;
      this.#createPromiseKey = null;
    });
  }
  return this.#createPromise;
}
```

**Step 3: Add helper methods**

```ts
/** Check validity without needing the private key (timestamp + contract coverage only). */
#isValidWithoutDecrypt(encrypted: EncryptedCredentials, requiredContracts: Address[]): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = encrypted.startTimestamp + encrypted.durationDays * 86400;
  if (nowSeconds >= expiresAt) return false;

  const signedSet = new Set(encrypted.contractAddresses.map((a) => a.toLowerCase()));
  return requiredContracts.every((addr) => signedSet.has(addr.toLowerCase()));
}

/** Re-create the EIP-712 data from stored params and prompt the wallet to sign. */
async #reSign(encrypted: EncryptedCredentials): Promise<string> {
  const eip712 = await this.#sdk.createEIP712(
    encrypted.publicKey,
    encrypted.contractAddresses,
    encrypted.startTimestamp,
    this.#durationDays,
  );
  return this.#signer.signTypedData(eip712);
}
```

**Step 4: Update `#decryptCredentials` to accept signature as parameter**

```ts
async #decryptCredentials(encrypted: EncryptedCredentials, signature: string): Promise<StoredCredentials> {
  const address = (await this.#signer.getAddress()).toLowerCase();
  const privateKey = await this.#decrypt(encrypted.encryptedPrivateKey, signature, address);
  const { encryptedPrivateKey: _, ...rest } = encrypted;
  return { ...rest, privateKey, signature };
}
```

**Step 5: Run tests**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: PASS — all existing tests plus the new format test should pass

**Step 6: Commit**

```bash
git add packages/sdk/src/token/credential-manager.ts
git commit -m "feat: session-scoped signatures with re-sign flow and legacy migration"
```

---

### Task 4: Add lock/unlock/isUnlocked public API

**Files:**

- Modify: `packages/sdk/src/token/credential-manager.ts`
- Modify: `packages/sdk/src/token/__tests__/credentials-manager.test.ts`

**Step 1: Write failing tests**

```ts
describe("session lock/unlock", () => {
  it("lock() clears session signature, next get() re-signs", async () => {
    await manager.get("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    manager.lock();

    await manager.get("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("isUnlocked() returns true after get(), false after lock()", async () => {
    expect(await manager.isUnlocked()).toBe(false);

    await manager.get("0xtoken" as Address);
    expect(await manager.isUnlocked()).toBe(true);

    manager.lock();
    expect(await manager.isUnlocked()).toBe(false);
  });

  it("unlock() pre-caches session signature without needing stored credentials", async () => {
    await manager.unlock(["0xtoken" as Address]);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await manager.isUnlocked()).toBe(true);

    // Subsequent get() should not re-sign
    await manager.get("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("lock() emits CredentialsLocked event", async () => {
    const events: string[] = [];
    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
      onEvent: (e) => events.push(e.type),
    });

    await manager2.get("0xtoken" as Address);
    manager2.lock();

    expect(events).toContain("credentials:locked");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: FAIL — `lock`, `unlock`, `isUnlocked` don't exist

**Step 3: Implement lock/unlock/isUnlocked**

```ts
/**
 * Clear the session signature. Stored credentials remain intact, but the
 * next decrypt operation will require a fresh wallet signature.
 */
lock(): void {
  this.#sessionSignatures.clear();
  this.#emit({ type: ZamaSDKEvents.CredentialsLocked });
}

/**
 * Pre-authorize by prompting the wallet to sign and caching the session
 * signature. If credentials already exist in storage, re-signs against them.
 * Otherwise creates fresh credentials.
 *
 * @param contractAddresses - Contract addresses to authorize for.
 */
async unlock(contractAddresses?: Address[]): Promise<void> {
  const addresses = contractAddresses ?? [];
  if (addresses.length > 0) {
    await this.getAll(addresses);
  }
  this.#emit({ type: ZamaSDKEvents.CredentialsUnlocked });
}

/**
 * Whether a session signature is currently cached for the connected wallet.
 */
async isUnlocked(): Promise<boolean> {
  const storeKey = await this.#storeKey();
  return this.#sessionSignatures.has(storeKey);
}
```

**Step 4: Run tests**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/token/credential-manager.ts packages/sdk/src/token/__tests__/credentials-manager.test.ts
git commit -m "feat: add lock/unlock/isUnlocked API for session signature management"
```

---

### Task 5: Update isExpired() and clear()

**Files:**

- Modify: `packages/sdk/src/token/credential-manager.ts`
- Modify: `packages/sdk/src/token/__tests__/credentials-manager.test.ts`

**Step 1: Write failing test for isExpired without session signature**

```ts
it("isExpired() works without session signature (checks timestamp only)", async () => {
  await manager.get("0xtoken" as Address);
  manager.lock();

  // Should still be able to check expiry without decrypting
  expect(await manager.isExpired()).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: FAIL — current `isExpired` calls `#decryptCredentials` which needs a signature

**Step 3: Update isExpired() to use timestamp-only check**

```ts
async isExpired(contractAddress?: Address): Promise<boolean> {
  const storeKey = await this.#storeKey();
  try {
    const stored = await this.#storage.getItem(storeKey);
    if (!stored) return false;

    const encrypted = JSON.parse(stored) as unknown;
    this.#assertEncryptedCredentials(encrypted);

    const requiredContracts = contractAddress ? [contractAddress] : [];
    return !this.#isValidWithoutDecrypt(encrypted, requiredContracts);
  } catch {
    return false;
  }
}
```

**Step 4: Update clear() to also clear session signature**

```ts
async clear(): Promise<void> {
  const storeKey = await this.#storeKey();
  this.#sessionSignatures.delete(storeKey);
  try { await this.#storage.removeItem(storeKey); } catch { /* best effort */ }
}
```

**Step 5: Run tests**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/credential-manager.ts packages/sdk/src/token/__tests__/credentials-manager.test.ts
git commit -m "fix: isExpired uses timestamp-only check, clear() also clears session"
```

---

### Task 6: Export new API and update public surface

**Files:**

- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/token/__tests__/credentials-manager.test.ts` (if more tests needed)

**Step 1: Verify CredentialsManager is already exported**

It's already exported at `packages/sdk/src/index.ts:56`. The `lock()`/`unlock()`/`isUnlocked()` methods are public instance methods, so they're automatically available. No export changes needed.

**Step 2: Run the full test suite**

Run: `cd packages/sdk && npx vitest run`
Expected: PASS — no regressions

**Step 3: Run type check**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit if any fixes were needed**

```bash
git add -A && git commit -m "chore: verify full test suite and type check pass"
```

---

### Task 7: Update API report (if api-extractor is configured)

**Files:**

- Check: `packages/sdk/etc/` for `.api.md` files

**Step 1: Check if api-extractor reports exist and regenerate**

Run: `cd packages/sdk && ls etc/*.api.md 2>/dev/null`

If reports exist:
Run: `cd packages/sdk && npx api-extractor run --local`
Then commit the updated report.

**Step 2: Commit**

```bash
git add packages/sdk/etc/
git commit -m "docs: update api-extractor report for session-scoped signatures"
```
