# Pluggable Credential Encryptor

**Date:** 2026-03-12
**Status:** Draft
**Scope:** `@zama-fhe/sdk` core, `@zama-fhe/react-sdk`

## Problem

The `CredentialsManager` hardcodes AES-256-GCM (with PBKDF2 key derivation from the wallet signature) as the only way to encrypt FHE private keys at rest. Enclave-based wallet providers like Turnkey, HSMs, and custom KMS backends cannot plug in their own sealing mechanisms. This limits adoption by infrastructure providers whose security model relies on encrypting secrets inside TEEs or hardware enclaves.

## Goals

1. Make the credential encryption layer pluggable without changing storage or orchestration.
2. Ship the current AES-GCM logic as the default implementation — zero behavioral change for existing users.
3. Export a public interface so third parties (Turnkey, etc.) can implement their own encryptors.
4. No Turnkey-specific code in the SDK.

## Non-goals

- Replacing or merging the `GenericStorage` interface. Storage and encryption remain separate concerns.
- Providing a migration path between encryptors. Switching encryptors triggers a one-time re-keying.
- Shipping encryptor implementations for specific providers (Turnkey, AWS KMS, etc.).

## Design

### New types

```ts
/**
 * Context available to the encryptor for key derivation or scoping.
 */
interface EncryptionContext {
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
interface CredentialEncryptor {
  /**
   * Encrypt the FHE private key.
   * The returned value is opaque to the SDK — it is persisted as-is
   * and passed back to `decrypt()`. May be any serializable type
   * (object, string, array, etc.).
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
   * The sealed value may be any type — do not assume it is an object.
   */
  isValidEncryptedData(sealed: unknown): boolean;
}
```

### Default implementation: `AesGcmEncryptor`

The existing PBKDF2 + AES-256-GCM logic is extracted from `CredentialsManager` into a standalone class:

```ts
class AesGcmEncryptor implements CredentialEncryptor {
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
      iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };
  }

  async decrypt(sealed: unknown, context: EncryptionContext): Promise<Hex> {
    const data = sealed as EncryptedData;
    const key = await this.#deriveKey(context.signature, context.address);
    const iv = Uint8Array.from(atob(data.iv), (c) => c.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      Uint8Array.from(atob(data.ciphertext), (c) => c.charCodeAt(0)),
    );
    const decoded = new TextDecoder().decode(plaintext);
    // Normalize to 0x-prefixed hex
    return (decoded.startsWith("0x") ? decoded : `0x${decoded}`) as Hex;
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
      { name: "PBKDF2", salt: encoder.encode(address), iterations: 600_000, hash: "SHA-256" },
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

**Moved from `CredentialsManager`:** `#deriveKey`, `#encrypt`, `#decrypt`, `#cachedDerivedKey`, `#cachedDerivedKeyIdentity`. These become internal to `AesGcmEncryptor`.

### CredentialsManager changes

**Config:**

```ts
interface CredentialsManagerConfig {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  keypairTTL?: number;
  sessionTTL?: number;
  onEvent?: ZamaSDKEventListener;
  encryptor?: CredentialEncryptor; // NEW — defaults to AesGcmEncryptor
}
```

**Constructor:** `this.#encryptor = config.encryptor ?? new AesGcmEncryptor();`

**New private helper:**

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

**Refactored `#encryptCredentials`:**

```ts
async #encryptCredentials(creds: StoredCredentials): Promise<EncryptedCredentials> {
  const context = await this.#encryptionContext(creds.signature, creds.publicKey);
  const encryptedPrivateKey = await this.#encryptor.encrypt(creds.privateKey, context);
  const { privateKey: _, signature: _sig, ...rest } = creds;
  return { ...rest, encryptedPrivateKey };
}
```

**Refactored `#decryptCredentials`:**

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

**Refactored `#assertEncryptedCredentials`:**

Only the `encryptedPrivateKey` inner shape validation is delegated to the encryptor. The outer credential structure checks (`publicKey`, `contractAddresses`) remain. The existing `assertObject(data.encryptedPrivateKey, ...)` call is also removed since custom encryptors may return non-object sealed blobs (e.g. a string).

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
  // Delegate encryptedPrivateKey shape validation to the encryptor
  // (replaces the hardcoded assertObject + iv/ciphertext checks)
  assertCondition(
    this.#encryptor.isValidEncryptedData(data.encryptedPrivateKey),
    "encryptedPrivateKey failed encryptor validation",
  );
}
```

**Simplified `#clearCryptoCache`:**

The derived key cache fields (`#cachedDerivedKey`, `#cachedDerivedKeyIdentity`) are removed from `CredentialsManager` entirely — they now live inside `AesGcmEncryptor`. The store key cache (`#cachedStoreKey`, `#cachedStoreKeyIdentity`) remains since it's storage-related, not encryption-related.

```ts
#clearCryptoCache(): void {
  this.#cachedStoreKey = null;
  this.#cachedStoreKeyIdentity = null;
}
```

**Removed from CredentialsManager:** `#deriveKey`, `#encrypt`, `#decrypt`, `#cachedDerivedKey`, `#cachedDerivedKeyIdentity`.

**Unchanged:** All orchestration logic — TTL management, session signatures, contract extension, EIP-712 signing, event emission, storage read/write flow.

### Public API surface

**New exports from `@zama-fhe/sdk`:**

```ts
export type { CredentialEncryptor, EncryptionContext };
export { AesGcmEncryptor };
```

**Extended configs:**

```ts
// ZamaSDKConfig
interface ZamaSDKConfig {
  // ... existing fields ...
  encryptor?: CredentialEncryptor;
}

// ZamaProviderProps (react-sdk)
interface ZamaProviderProps extends PropsWithChildren {
  // ... existing fields ...
  encryptor?: CredentialEncryptor;
}
```

Both forward the value to `CredentialsManager` unchanged.

### Storage compatibility

**No migration between encryptors.** When a user switches encryptors, the existing stored credentials fail validation on the new encryptor. The existing `try/catch` in `allow()` handles this gracefully:

1. `#assertEncryptedCredentials` calls `this.#encryptor.isValidEncryptedData(data.encryptedPrivateKey)`, which returns `false`
2. The assertion throws (not `isValidEncryptedData` itself — the assert wrapper throws)
3. The `catch` block in `allow()` deletes the unreadable entry from storage (best effort)
4. Falls through to `create()` — generates a fresh FHE keypair, seals with the new encryptor
5. User sees one extra wallet signature prompt

Same behavior in reverse (custom encryptor back to default). This is intentional — translating sealed data between encryption backends would require both encryptors simultaneously for a rare migration scenario. A single wallet signature prompt is an acceptable cost.

### EncryptedCredentials type change

The internal `EncryptedCredentials` interface changes:

```ts
// Before
interface EncryptedCredentials {
  publicKey: Hex;
  contractAddresses: Address[];
  startTimestamp: number;
  durationDays: number;
  encryptedPrivateKey: EncryptedData; // { iv: string; ciphertext: string }
}

// After
interface EncryptedCredentials {
  publicKey: Hex;
  contractAddresses: Address[];
  startTimestamp: number;
  durationDays: number;
  encryptedPrivateKey: unknown; // Shape determined by CredentialEncryptor
}
```

This type is internal (not exported). The `unknown` is validated at read time via `isValidEncryptedData`.

## Testing

**`AesGcmEncryptor` unit tests:**

- Round-trip: encrypt then decrypt returns original private key
- Different contexts produce different ciphertexts
- `isValidEncryptedData` accepts `{ iv, ciphertext }`, rejects other shapes
- Derived key caching works (same context reuses key)

**`CredentialsManager` with custom encryptor:**

- Mock `CredentialEncryptor` — verify `encrypt`/`decrypt`/`isValidEncryptedData` called with correct `EncryptionContext` fields
- Default behavior (no `encryptor` passed) identical to current behavior
- Encryptor switch triggers re-keying: old blob rejected, fresh keypair created

**Existing test suite:** Must pass unchanged — default `AesGcmEncryptor` produces identical behavior.

## Example: Turnkey enclave encryptor

For documentation purposes. Not shipped in the SDK.

```ts
import type { CredentialEncryptor, EncryptionContext } from "@zama-fhe/sdk";

class TurnkeyEncryptor implements CredentialEncryptor {
  #client: TurnkeyApiClient;
  #organizationId: string;

  constructor(client: TurnkeyApiClient, organizationId: string) {
    this.#client = client;
    this.#organizationId = organizationId;
  }

  async encrypt(privateKey: Hex, context: EncryptionContext): Promise<unknown> {
    const sealed = await this.#client.seal({
      organizationId: this.#organizationId,
      plaintext: privateKey,
      metadata: {
        address: context.address,
        chainId: context.chainId,
        publicKey: context.publicKey,
      },
    });
    return { sealedBlob: sealed.ciphertext, keyId: sealed.keyId };
  }

  async decrypt(sealed: unknown, context: EncryptionContext): Promise<Hex> {
    const data = sealed as { sealedBlob: string; keyId: string };
    const result = await this.#client.unseal({
      organizationId: this.#organizationId,
      ciphertext: data.sealedBlob,
      keyId: data.keyId,
    });
    return result.plaintext as Hex;
  }

  isValidEncryptedData(sealed: unknown): boolean {
    if (typeof sealed !== "object" || sealed === null) return false;
    const obj = sealed as Record<string, unknown>;
    return typeof obj.sealedBlob === "string" && typeof obj.keyId === "string";
  }
}
```

## Files affected

| File                                                     | Change                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/sdk/src/token/token.types.ts`                  | Add `CredentialEncryptor`, `EncryptionContext` interfaces                        |
| `packages/sdk/src/token/aes-gcm-encryptor.ts`            | New file — extracted AES-GCM implementation                                      |
| `packages/sdk/src/token/credentials-manager.ts`          | Accept `encryptor`, delegate encryption, remove inline crypto                    |
| `packages/sdk/src/token/zama-sdk.ts`                     | Add `encryptor?` to `ZamaSDKConfig`, forward to `CredentialsManager`             |
| `packages/sdk/src/index.ts`                              | Export new types and `AesGcmEncryptor`                                           |
| `packages/react-sdk/src/provider.tsx`                    | Add `encryptor?` to `ZamaProviderProps`, forward to `ZamaSDK`                    |
| `packages/react-sdk/src/index.ts`                        | Re-export `CredentialEncryptor`, `EncryptionContext` types and `AesGcmEncryptor` |
| `packages/sdk/src/__tests__/aes-gcm-encryptor.test.ts`   | New — unit tests for extracted encryptor                                         |
| `packages/sdk/src/__tests__/credentials-manager.test.ts` | Add custom encryptor tests                                                       |
