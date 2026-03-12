# Pluggable Credential Encryptor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the hardcoded AES-GCM encryption from `CredentialsManager` into a pluggable `CredentialEncryptor` interface so third parties can implement custom encryption backends.

**Architecture:** A new `CredentialEncryptor` interface defines `encrypt`/`decrypt`/`isValidEncryptedData`. The existing AES-GCM logic moves to `AesGcmEncryptor` (default). `CredentialsManager` accepts an optional `encryptor` and delegates all encryption to it. Config surfaces bubble through `ZamaSDKConfig` → `ZamaProviderProps`.

**Tech Stack:** TypeScript, vitest, Web Crypto API, viem types

**Spec:** `docs/superpowers/specs/2026-03-12-pluggable-credential-encryptor-design.md`

---

## File Structure

| File                                                           | Action | Responsibility                                                       |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `packages/sdk/src/token/token.types.ts`                        | Modify | Add `CredentialEncryptor` and `EncryptionContext` interfaces         |
| `packages/sdk/src/token/aes-gcm-encryptor.ts`                  | Create | Default AES-GCM encryptor extracted from `CredentialsManager`        |
| `packages/sdk/src/token/__tests__/aes-gcm-encryptor.test.ts`   | Create | Unit tests for `AesGcmEncryptor`                                     |
| `packages/sdk/src/token/credentials-manager.ts`                | Modify | Accept `encryptor`, delegate encryption, remove inline crypto        |
| `packages/sdk/src/token/__tests__/credentials-manager.test.ts` | Modify | Add custom encryptor and encryptor-switch tests                      |
| `packages/sdk/src/token/zama-sdk.ts`                           | Modify | Add `encryptor?` to `ZamaSDKConfig`, forward to `CredentialsManager` |
| `packages/sdk/src/index.ts`                                    | Modify | Export `AesGcmEncryptor`, `CredentialEncryptor`, `EncryptionContext` |
| `packages/react-sdk/src/provider.tsx`                          | Modify | Add `encryptor?` to `ZamaProviderProps`, forward to `ZamaSDK`        |
| `packages/react-sdk/src/index.ts`                              | Modify | Re-export new types and class                                        |

---

## Chunk 1: Interfaces and AesGcmEncryptor

### Task 1: Add `CredentialEncryptor` and `EncryptionContext` to `token.types.ts`

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts`

- [ ] **Step 1: Add the interfaces at the end of `token.types.ts`**

Append after the `TransferCallbacks` interface (after line 201):

```ts
/**
 * Context available to the encryptor for key derivation or scoping.
 */
export interface EncryptionContext {
  /** Wallet address (checksummed). */
  address: Address;
  /** EIP-712 wallet signature authorizing the FHE keypair. */
  signature: Hex;
  /** Connected chain ID. */
  chainId: number;
  /** FHE public key (identifies which keypair is being sealed). */
  publicKey: Hex;
}

/**
 * Pluggable encryption backend for FHE credentials.
 *
 * Implementors control how the FHE private key is sealed at rest.
 * The SDK persists whatever `encrypt()` returns via `GenericStorage`
 * and passes it back to `decrypt()` on read.
 *
 * **Error contract:** If `decrypt()` throws, the SDK treats the stored
 * credentials as corrupt, deletes them, and regenerates a fresh keypair
 * (the user sees one extra wallet signature prompt). Encryptor authors
 * do not need to handle recovery — just throw on failure.
 *
 * **Signature invariant:** The `context.signature` passed to `decrypt()`
 * is always the same value that was passed to the corresponding
 * `encrypt()` call. The SDK ensures this by persisting the encrypted
 * blob and session signature atomically.
 */
export interface CredentialEncryptor {
  /**
   * Encrypt the FHE private key.
   * The returned value is opaque to the SDK — it is persisted as-is
   * and passed back to `decrypt()`.
   */
  encrypt(privateKey: Hex, context: EncryptionContext): Promise<unknown>;

  /**
   * Decrypt a previously sealed blob back to the FHE private key.
   * `sealed` is whatever `encrypt()` returned.
   */
  decrypt(sealed: unknown, context: EncryptionContext): Promise<Hex>;

  /**
   * Type guard: return true if `sealed` is a valid encrypted blob
   * produced by this encryptor. Called during storage read validation.
   */
  isValidEncryptedData(sealed: unknown): boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/token/token.types.ts
git commit -m "feat: add CredentialEncryptor and EncryptionContext interfaces"
```

---

### Task 2: Create `AesGcmEncryptor` with tests (TDD)

**Files:**

- Create: `packages/sdk/src/token/aes-gcm-encryptor.ts`
- Create: `packages/sdk/src/token/__tests__/aes-gcm-encryptor.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `packages/sdk/src/token/__tests__/aes-gcm-encryptor.test.ts`:

```ts
import { describe, it, expect, vi } from "../../test-fixtures";
import { AesGcmEncryptor } from "../aes-gcm-encryptor";
import type { EncryptionContext } from "../token.types";
import type { Address, Hex } from "viem";

const CONTEXT: EncryptionContext = {
  address: "0x2222222222222222222222222222222222abCDEF" as Address,
  signature: "0xsig789" as Hex,
  chainId: 31337,
  publicKey: "0xpub123" as Hex,
};

describe("AesGcmEncryptor", () => {
  it("round-trips: encrypt then decrypt returns original private key", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;

    const sealed = await encryptor.encrypt(privateKey, CONTEXT);
    const decrypted = await encryptor.decrypt(sealed, CONTEXT);

    expect(decrypted).toBe(privateKey);
  });

  it("decrypt normalizes non-0x-prefixed plaintext", async () => {
    const encryptor = new AesGcmEncryptor();
    // Use a key without 0x prefix to test normalization
    const privateKey = "0xabcdef" as Hex;

    const sealed = await encryptor.encrypt(privateKey, CONTEXT);
    const decrypted = await encryptor.decrypt(sealed, CONTEXT);

    expect(decrypted).toBe("0xabcdef");
  });

  it("different contexts produce different ciphertexts", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;

    const sealed1 = await encryptor.encrypt(privateKey, CONTEXT);
    const sealed2 = await encryptor.encrypt(privateKey, {
      ...CONTEXT,
      signature: "0xdifferentsig" as Hex,
    });

    // AES-GCM uses random IV, so even same context produces different ciphertext,
    // but different contexts should also differ (different derived key)
    const s1 = sealed1 as { ciphertext: string };
    const s2 = sealed2 as { ciphertext: string };
    expect(s1.ciphertext).not.toBe(s2.ciphertext);
  });

  it("isValidEncryptedData accepts { iv, ciphertext }", () => {
    const encryptor = new AesGcmEncryptor();

    expect(encryptor.isValidEncryptedData({ iv: "abc", ciphertext: "def" })).toBe(true);
  });

  it("isValidEncryptedData rejects null", () => {
    const encryptor = new AesGcmEncryptor();

    expect(encryptor.isValidEncryptedData(null)).toBe(false);
  });

  it("isValidEncryptedData rejects non-objects", () => {
    const encryptor = new AesGcmEncryptor();

    expect(encryptor.isValidEncryptedData("string")).toBe(false);
    expect(encryptor.isValidEncryptedData(42)).toBe(false);
    expect(encryptor.isValidEncryptedData(undefined)).toBe(false);
  });

  it("isValidEncryptedData rejects objects missing iv or ciphertext", () => {
    const encryptor = new AesGcmEncryptor();

    expect(encryptor.isValidEncryptedData({ iv: "abc" })).toBe(false);
    expect(encryptor.isValidEncryptedData({ ciphertext: "abc" })).toBe(false);
    expect(encryptor.isValidEncryptedData({})).toBe(false);
  });

  it("isValidEncryptedData rejects non-string iv or ciphertext", () => {
    const encryptor = new AesGcmEncryptor();

    expect(encryptor.isValidEncryptedData({ iv: 123, ciphertext: "abc" })).toBe(false);
    expect(encryptor.isValidEncryptedData({ iv: "abc", ciphertext: 123 })).toBe(false);
  });

  it("caches derived key for same signature+address", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;

    const deriveKeySpy = vi.spyOn(crypto.subtle, "deriveKey");

    await encryptor.encrypt(privateKey, CONTEXT);
    await encryptor.encrypt(privateKey, CONTEXT);

    // Should derive key only once — second call uses cache
    expect(deriveKeySpy).toHaveBeenCalledOnce();

    deriveKeySpy.mockRestore();
  });

  it("re-derives key when signature changes", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;

    const deriveKeySpy = vi.spyOn(crypto.subtle, "deriveKey");

    await encryptor.encrypt(privateKey, CONTEXT);
    await encryptor.encrypt(privateKey, {
      ...CONTEXT,
      signature: "0xdifferentsig" as Hex,
    });

    expect(deriveKeySpy).toHaveBeenCalledTimes(2);

    deriveKeySpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- packages/sdk/src/token/__tests__/aes-gcm-encryptor.test.ts`
Expected: FAIL — `Cannot find module '../aes-gcm-encryptor'`

- [ ] **Step 3: Create `aes-gcm-encryptor.ts` with the implementation**

Create `packages/sdk/src/token/aes-gcm-encryptor.ts`:

```ts
import type { Address, Hex } from "viem";
import type { CredentialEncryptor, EncryptionContext } from "./token.types";
import { prefixHex } from "../utils";

/** Encrypted data format with IV for AES-GCM decryption. */
export interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}

/**
 * Default AES-256-GCM encryptor for FHE credentials.
 *
 * Derives an encryption key from the wallet signature via PBKDF2
 * (600k iterations, SHA-256, salted with the wallet address).
 */
export class AesGcmEncryptor implements CredentialEncryptor {
  #cachedKey: CryptoKey | null = null;
  #cachedKeyIdentity: string | null = null;

  async encrypt(privateKey: Hex, context: EncryptionContext): Promise<EncryptedData> {
    const key = await this.#deriveKey(context.signature, context.address);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(privateKey),
    );
    return {
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };
  }

  async decrypt(sealed: unknown, context: EncryptionContext): Promise<Hex> {
    const data = sealed as EncryptedData;
    const key = await this.#deriveKey(context.signature, context.address);
    const iv = Uint8Array.from(atob(data.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(data.ciphertext), (c) => c.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return prefixHex(new TextDecoder().decode(plaintext));
  }

  isValidEncryptedData(sealed: unknown): sealed is EncryptedData {
    if (typeof sealed !== "object" || sealed === null) return false;
    const obj = sealed as Record<string, unknown>;
    return typeof obj.iv === "string" && typeof obj.ciphertext === "string";
  }

  /** PBKDF2 derivation — 600k iterations, SHA-256, salted with address. */
  async #deriveKey(signature: Hex, address: Address): Promise<CryptoKey> {
    const identity = `${signature}:${address}`;
    if (this.#cachedKey && this.#cachedKeyIdentity === identity) {
      return this.#cachedKey;
    }
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signature),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(address),
        iterations: 600_000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    this.#cachedKeyIdentity = identity;
    this.#cachedKey = key;
    return key;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- packages/sdk/src/token/__tests__/aes-gcm-encryptor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd packages/sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/token/aes-gcm-encryptor.ts packages/sdk/src/token/__tests__/aes-gcm-encryptor.test.ts
git commit -m "feat: add AesGcmEncryptor default implementation with tests"
```

---

## Chunk 2: Refactor CredentialsManager

### Task 3: Refactor `CredentialsManager` to use `CredentialEncryptor`

**Files:**

- Modify: `packages/sdk/src/token/credentials-manager.ts`

This task makes 6 targeted changes to `credentials-manager.ts`. Each step is an edit.

- [ ] **Step 1: Add import for `AesGcmEncryptor` and `CredentialEncryptor`/`EncryptionContext`**

Replace the import block at the top (lines 1-9). Add the new imports:

```ts
import type { RelayerSDK } from "../relayer/relayer-sdk";

import type {
  CredentialEncryptor,
  EncryptionContext,
  GenericSigner,
  GenericStorage,
  StoredCredentials,
} from "./token.types";
import { AesGcmEncryptor } from "./aes-gcm-encryptor";
import { MemoryStorage } from "./memory-storage";
import { SigningRejectedError, SigningFailedError } from "./errors";
import { assertObject, assertString, assertArray, assertCondition, prefixHex } from "../utils";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { getAddress, isAddress, type Address, type Hex } from "viem";
```

- [ ] **Step 2: Remove the local `EncryptedData` interface (lines 11-15)**

Delete:

```ts
/** Encrypted data format with IV for AES-GCM decryption. */
interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}
```

- [ ] **Step 3: Change `EncryptedCredentials.encryptedPrivateKey` type from `EncryptedData` to `unknown`**

Replace lines 17-20:

```ts
/** Internal storage shape — privateKey and signature are excluded; only encrypted privateKey is stored. */
interface EncryptedCredentials extends Omit<StoredCredentials, "privateKey" | "signature"> {
  encryptedPrivateKey: unknown;
}
```

- [ ] **Step 4: Add `encryptor?` to `CredentialsManagerConfig` (after line 53)**

Add before the closing `}` of `CredentialsManagerConfig`:

```ts
  /** Pluggable encryption backend for FHE credentials. Defaults to AES-256-GCM. */
  encryptor?: CredentialEncryptor;
```

- [ ] **Step 5: Add `#encryptor` field and initialize in constructor**

In the `CredentialsManager` class, replace the two derived key cache fields (lines 76-77):

```ts
  #cachedDerivedKey: CryptoKey | null = null;
  #cachedDerivedKeyIdentity: string | null = null;
```

With:

```ts
  #encryptor: CredentialEncryptor;
```

In the constructor (after line 98 `this.#sessionTTL = config.sessionTTL ?? 2592000;`), add:

```ts
this.#encryptor = config.encryptor ?? new AesGcmEncryptor();
```

- [ ] **Step 6: Simplify `#clearCryptoCache` — remove derived key cache lines**

Replace the `#clearCryptoCache` method (lines 298-303):

```ts
  /** Clear cached cryptographic material (store key cache). */
  #clearCryptoCache(): void {
    this.#cachedStoreKey = null;
    this.#cachedStoreKeyIdentity = null;
  }
```

- [ ] **Step 7: Replace `#assertEncryptedCredentials` to delegate to encryptor**

Replace lines 354-367:

```ts
  #assertEncryptedCredentials(data: unknown): asserts data is EncryptedCredentials {
    assertObject(data, "Stored credentials");
    assertString(data.publicKey, "credentials.publicKey");
    assertArray(data.contractAddresses, "credentials.contractAddresses");
    for (const addr of data.contractAddresses) {
      assertCondition(
        typeof addr === "string" && isAddress(addr, { strict: false }),
        `Expected each contractAddress to be a valid hex address`,
      );
    }
    assertCondition(
      this.#encryptor.isValidEncryptedData(data.encryptedPrivateKey),
      "encryptedPrivateKey failed encryptor validation",
    );
  }
```

- [ ] **Step 8: Replace `#encryptCredentials` to use encryptor + context**

Replace lines 557-562:

```ts
  async #encryptCredentials(creds: StoredCredentials): Promise<EncryptedCredentials> {
    const context = await this.#encryptionContext(creds.signature, creds.publicKey);
    const encryptedPrivateKey = await this.#encryptor.encrypt(creds.privateKey, context);
    const { privateKey: _, signature: _sig, ...rest } = creds;
    return { ...rest, encryptedPrivateKey };
  }
```

- [ ] **Step 9: Replace `#decryptCredentials` to use encryptor + context**

Replace lines 564-572:

```ts
  async #decryptCredentials(
    encrypted: EncryptedCredentials,
    signature: Hex,
  ): Promise<StoredCredentials> {
    const context = await this.#encryptionContext(signature, encrypted.publicKey);
    const privateKey = await this.#encryptor.decrypt(encrypted.encryptedPrivateKey, context);
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey, signature };
  }
```

- [ ] **Step 10: Add `#encryptionContext` helper and remove `#deriveKey`, `#encrypt`, `#decrypt`**

Remove the entire AES-GCM section (lines 555 comment through 639) — specifically:

- The `// ── AES-GCM encryption  ─────────────` comment (line 555)
- `#deriveKey` method (lines 579-610)
- `#encrypt` method (lines 613-628)
- `#decrypt` method (lines 631-639)

Add the `#encryptionContext` helper after the refactored `#decryptCredentials`:

```ts
  async #encryptionContext(signature: Hex, publicKey: Hex): Promise<EncryptionContext> {
    return {
      address: await this.#signer.getAddress(),
      signature,
      chainId: await this.#signer.getChainId(),
      publicKey,
    };
  }
```

- [ ] **Step 11: Also update the class JSDoc comment (lines 31-36)**

Replace:

```ts
/**
 * Manages FHE decrypt credentials (keypair + EIP-712 signature).
 * Generates and refreshes credentials transparently.
 *
 * The privateKey is encrypted with AES-GCM (key derived from the
 * wallet signature via PBKDF2) before being written to the store.
 */
```

With:

```ts
/**
 * Manages FHE decrypt credentials (keypair + EIP-712 signature).
 * Generates and refreshes credentials transparently.
 *
 * The privateKey is encrypted at rest using a pluggable {@link CredentialEncryptor}
 * (defaults to AES-256-GCM with PBKDF2 key derivation).
 */
```

- [ ] **Step 12: Run ALL existing tests to verify no regressions**

Run: `pnpm test:run -- packages/sdk/src/token/__tests__/credentials-manager.test.ts`
Expected: ALL existing tests PASS (default `AesGcmEncryptor` is behavioral equivalent)

- [ ] **Step 13: Run TypeScript check**

Run: `cd packages/sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 14: Commit**

```bash
git add packages/sdk/src/token/credentials-manager.ts
git commit -m "refactor: delegate encryption to pluggable CredentialEncryptor"
```

---

### Task 4: Add custom encryptor tests to `credentials-manager.test.ts`

**Files:**

- Modify: `packages/sdk/src/token/__tests__/credentials-manager.test.ts`

- [ ] **Step 1: Add custom encryptor test suite**

Add at the end of the file (after the `KeypairExpiredError` describe block):

```ts
describe("custom CredentialEncryptor", () => {
  /** A trivial mock encryptor that just base64-encodes the private key. */
  function createMockEncryptor() {
    return {
      encrypt: vi.fn(async (privateKey: string) => ({
        wrapped: btoa(privateKey),
      })),
      decrypt: vi.fn(async (sealed: unknown) => {
        const data = sealed as { wrapped: string };
        return atob(data.wrapped) as `0x${string}`;
      }),
      isValidEncryptedData: vi.fn((sealed: unknown): boolean => {
        if (typeof sealed !== "object" || sealed === null) return false;
        return typeof (sealed as Record<string, unknown>).wrapped === "string";
      }),
    };
  }

  it("uses custom encryptor for encrypt/decrypt", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const encryptor = createMockEncryptor();
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      encryptor,
    });

    const creds = await manager.allow(TOKEN_A);

    expect(encryptor.encrypt).toHaveBeenCalledOnce();
    expect(creds.privateKey).toBe("0xpriv456");
    expect(creds.publicKey).toBe("0xpub123");
  });

  it("passes correct EncryptionContext to encrypt", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const encryptor = createMockEncryptor();
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      encryptor,
    });

    await manager.allow(TOKEN_A);

    const [, context] = encryptor.encrypt.mock.calls[0]!;
    expect(context).toMatchObject({
      address: await signer.getAddress(),
      signature: "0xsig789",
      chainId: 31337,
      publicKey: "0xpub123",
    });
  });

  it("calls isValidEncryptedData during storage read", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const encryptor = createMockEncryptor();
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      encryptor,
    });

    await manager.allow(TOKEN_A);

    // Second manager reads from storage — calls isValidEncryptedData
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      encryptor,
    });
    await manager2.allow(TOKEN_A);

    // isValidEncryptedData called during storage read validation
    expect(encryptor.isValidEncryptedData).toHaveBeenCalled();
  });

  it("encryptor switch triggers re-keying (old blob rejected)", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);

    // Create credentials with default AES-GCM encryptor
    const manager1 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    await manager1.allow(TOKEN_A);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();

    // Switch to custom encryptor — old blob fails isValidEncryptedData
    const customEncryptor = createMockEncryptor();
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      encryptor: customEncryptor,
    });
    await manager2.allow(TOKEN_A);

    // Should regenerate: old AES-GCM blob fails custom encryptor's validation
    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
    // New credentials encrypted with custom encryptor
    expect(customEncryptor.encrypt).toHaveBeenCalledOnce();
  });

  it("default behavior (no encryptor) is identical to current AES-GCM behavior", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);

    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });

    const creds = await manager.allow(TOKEN_A);
    expect(creds.publicKey).toBe("0xpub123");
    expect(creds.privateKey).toBe("0xpriv456");

    // Verify stored data has AES-GCM shape (iv + ciphertext)
    const storeKey = await CredentialsManager.computeStoreKey(await signer.getAddress(), 31337);
    const stored = (await storage.get(storeKey)) as Record<string, unknown>;
    const epk = stored.encryptedPrivateKey as Record<string, unknown>;
    expect(typeof epk.iv).toBe("string");
    expect(typeof epk.ciphertext).toBe("string");
  });
});
```

- [ ] **Step 2: Add import for `CredentialEncryptor` type (not needed — we use inline mock)**

No import changes needed. The mock encryptor satisfies the interface structurally.

- [ ] **Step 3: Run ALL tests**

Run: `pnpm test:run -- packages/sdk/src/token/__tests__/credentials-manager.test.ts`
Expected: ALL tests PASS (existing + new)

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/token/__tests__/credentials-manager.test.ts
git commit -m "test: add custom CredentialEncryptor tests for credentials-manager"
```

---

## Chunk 3: Config Plumbing and Exports

### Task 5: Add `encryptor?` to `ZamaSDKConfig` and forward through

**Files:**

- Modify: `packages/sdk/src/token/zama-sdk.ts`

- [ ] **Step 1: Add import for `CredentialEncryptor`**

In the import block at line 7, add `CredentialEncryptor` to the import from `./token.types`:

```ts
import type { GenericSigner, GenericStorage, CredentialEncryptor } from "./token.types";
```

- [ ] **Step 2: Add `encryptor?` to `ZamaSDKConfig` interface**

Add after line 43 (`signerLifecycleCallbacks?: SignerLifecycleCallbacks;`):

```ts
  /** Pluggable encryption backend for FHE credentials. Defaults to AES-256-GCM. */
  encryptor?: CredentialEncryptor;
```

- [ ] **Step 3: Forward `encryptor` in the constructor**

In the `CredentialsManager` constructor call (lines 68-80), add `encryptor`:

```ts
this.credentials = new CredentialsManager({
  relayer: this.relayer,
  signer: this.signer,
  storage: this.storage,
  sessionStorage: this.sessionStorage,
  keypairTTL: (() => {
    const ttl = config.keypairTTL ?? 86400;
    if (ttl <= 0) throw new Error("keypairTTL must be a positive number (seconds)");
    return ttl;
  })(),
  sessionTTL: config.sessionTTL ?? 2592000,
  onEvent: this.#onEvent,
  encryptor: config.encryptor,
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd packages/sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/token/zama-sdk.ts
git commit -m "feat: add encryptor option to ZamaSDKConfig"
```

---

### Task 6: Add `encryptor?` to `ZamaProviderProps` and forward

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx`

- [ ] **Step 1: Add import for `CredentialEncryptor`**

In the import at line 3-8, add `CredentialEncryptor`:

```ts
import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  ZamaSDKEventListener,
  CredentialEncryptor,
} from "@zama-fhe/sdk";
```

- [ ] **Step 2: Add `encryptor?` to `ZamaProviderProps`**

Add after `onEvent?: ZamaSDKEventListener;` (line 47):

```ts
  /** Pluggable encryption backend for FHE credentials. Defaults to AES-256-GCM. */
  encryptor?: CredentialEncryptor;
```

- [ ] **Step 3: Destructure `encryptor` in `ZamaProvider` function**

Add `encryptor` to the destructured props (line 62-71):

```ts
export function ZamaProvider({
  children,
  relayer,
  signer,
  storage,
  sessionStorage,
  keypairTTL,
  sessionTTL,
  onEvent,
  encryptor,
}: ZamaProviderProps) {
```

- [ ] **Step 4: Forward `encryptor` to `ZamaSDK` constructor and add to deps**

In the `useMemo` (lines 92-104), add `encryptor` to the constructor and deps:

```ts
const sdk = useMemo(
  () =>
    new ZamaSDK({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL,
      sessionTTL,
      onEvent: onEventRef.current,
      signerLifecycleCallbacks,
      encryptor,
    }),
  [
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL,
    sessionTTL,
    signerLifecycleCallbacks,
    encryptor,
  ],
);
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd packages/react-sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/react-sdk/src/provider.tsx
git commit -m "feat: add encryptor prop to ZamaProviderProps"
```

---

### Task 7: Add exports to `packages/sdk/src/index.ts`

**Files:**

- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Add `AesGcmEncryptor` class export**

After line 64 (`export { CredentialsManager } from "./token/credentials-manager";`), add:

```ts
export { AesGcmEncryptor } from "./token/aes-gcm-encryptor";
```

- [ ] **Step 2: Add `CredentialEncryptor` and `EncryptionContext` type exports**

In the type export block from `"./token/token.types"` (lines 71-89), add the two new types. Add after `StoredCredentials,` (line 75):

```ts
  CredentialEncryptor,
  EncryptionContext,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "feat: export AesGcmEncryptor, CredentialEncryptor, EncryptionContext"
```

---

### Task 8: Add re-exports to `packages/react-sdk/src/index.ts`

**Files:**

- Modify: `packages/react-sdk/src/index.ts`

- [ ] **Step 1: Add `AesGcmEncryptor` to class re-exports**

In the core class re-exports block (lines 42-53), add `AesGcmEncryptor`:

```ts
export {
  RelayerWeb,
  ZamaSDK,
  Token,
  ReadonlyToken,
  MemoryStorage,
  IndexedDBStorage,
  indexedDBStorage,
  CredentialsManager,
  ChromeSessionStorage,
  chromeSessionStorage,
  AesGcmEncryptor,
} from "@zama-fhe/sdk";
```

- [ ] **Step 2: Add `CredentialEncryptor` and `EncryptionContext` to type re-exports**

In the core type re-exports block (lines 56-117), add after `CredentialsManagerConfig,` (line 86):

```ts
  CredentialEncryptor,
  EncryptionContext,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/react-sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/react-sdk/src/index.ts
git commit -m "feat: re-export CredentialEncryptor types from react-sdk"
```

---

## Chunk 4: Final Verification

### Task 9: Run full test suite and build

- [ ] **Step 1: Run ALL SDK tests**

Run: `pnpm test:run`
Expected: ALL tests PASS

- [ ] **Step 2: Run typecheck for both packages**

Run: `cd packages/sdk && pnpm typecheck && cd ../react-sdk && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Run lint**

Run: `cd packages/sdk && pnpm lint`
Expected: No new lint errors

- [ ] **Step 5: Final commit (if any fixups needed)**

If any fixups were needed, commit them:

```bash
git add -A
git commit -m "chore: fixups from final verification"
```
