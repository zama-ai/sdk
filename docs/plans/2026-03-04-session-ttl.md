# Session TTL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global `sessionTTL` config option controlling how long EIP-712 session signatures remain valid before requiring re-authentication.

**Architecture:** Replace the bare signature string in session storage with a structured `SessionEntry` containing `signature`, `createdAt`, and `ttl`. Check TTL lazily in `allow()` and `isAllowed()`. Emit a new `session:expired` event on expiry. No background timers.

**Tech Stack:** TypeScript, Vitest, existing GenericStorage abstraction.

---

### Task 1: Add SessionTTL type and SessionExpired event

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts`
- Modify: `packages/sdk/src/events/sdk-events.ts`
- Modify: `packages/sdk/src/index.ts`

**Step 1: Add SessionTTL type to token.types.ts**

Add after the `UnshieldCallbacks` interface (line 117):

```typescript
/**
 * Controls how long session signatures remain valid.
 * - `"persistent"` (default): no time-based expiry, current behavior.
 * - `0`: never persist — every operation triggers a signing prompt.
 * - Positive number: seconds until the session signature expires.
 */
export type SessionTTL = "persistent" | number;
```

**Step 2: Add SessionExpired event to sdk-events.ts**

Add to the `ZamaSDKEvents` const (after `CredentialsAllowed` line 14):

```typescript
  SessionExpired: "session:expired",
```

Add the event interface (after `CredentialsAllowedEvent`):

```typescript
export interface SessionExpiredEvent extends BaseEvent {
  type: typeof ZamaSDKEvents.SessionExpired;
  /** Why the session expired. Currently always `"ttl"`, extensible for future inactivity timeout. */
  reason: "ttl";
}
```

Add `SessionExpiredEvent` to the `ZamaSDKEvent` union (after `CredentialsAllowedEvent`).

**Step 3: Add exports to index.ts**

Add `SessionTTL` to the type export from `./token/token.types` (line 76):

```typescript
export type {
  // ... existing exports ...
  SessionTTL,
} from "./token/token.types";
```

Add `SessionExpiredEvent` to the type export from `./events/sdk-events` (line 107):

```typescript
  SessionExpiredEvent,
```

**Step 4: Run build to verify types compile**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```
feat(sdk): add SessionTTL type and SessionExpired event
```

---

### Task 2: Add sessionTTL to CredentialsManager and ZamaSDK config

**Files:**

- Modify: `packages/sdk/src/token/credentials-manager.ts`
- Modify: `packages/sdk/src/token/zama-sdk.ts`

**Step 1: Add sessionTTL to CredentialsManagerConfig**

In `credentials-manager.ts`, add to `CredentialsManagerConfig` interface (after `durationDays` line 44):

```typescript
/** Controls session signature lifetime. Default: `"persistent"`. */
sessionTTL: SessionTTL;
```

Add the import at the top:

```typescript
import type { GenericSigner, GenericStorage, StoredCredentials, SessionTTL } from "./token.types";
```

Add the private field and constructor assignment in `CredentialsManager`:

```typescript
  #sessionTTL: SessionTTL;
```

In constructor:

```typescript
this.#sessionTTL = config.sessionTTL;
```

**Step 2: Add sessionTTL to ZamaSDKConfig and pass through**

In `zama-sdk.ts`, add to `ZamaSDKConfig` interface (after `credentialDurationDays`):

```typescript
  /**
   * Controls how long session signatures (EIP-712 wallet signatures) remain valid.
   * - `"persistent"` (default): no time-based expiry, sessions last until revocation or storage clear.
   * - `0`: never persist — every operation triggers a signing prompt (high-security mode).
   * - Positive number: seconds until the session signature expires and requires re-authentication.
   */
  sessionTTL?: SessionTTL;
```

Add import of `SessionTTL` from `./token.types`.

In the `ZamaSDK` constructor, pass `sessionTTL` to `CredentialsManager`:

```typescript
this.credentials = new CredentialsManager({
  // ... existing fields ...
  sessionTTL: config.sessionTTL ?? "persistent",
});
```

**Step 3: Run build to verify**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```
feat(sdk): add sessionTTL config to CredentialsManager and ZamaSDK
```

---

### Task 3: Implement session entry storage and TTL checking

**Files:**

- Modify: `packages/sdk/src/token/credentials-manager.ts`

**Step 1: Add SessionEntry type and helper methods**

Add after the `LegacyEncryptedCredentials` interface (line 24):

```typescript
/** Structured session entry stored in session storage (replaces bare signature string). */
interface SessionEntry {
  signature: string;
  /** Epoch seconds when the session was created. */
  createdAt: number;
  /** TTL at creation time (not current config). */
  ttl: SessionTTL;
}
```

Add private helper methods to the `CredentialsManager` class:

```typescript
  /** Check if a session entry has expired based on its recorded TTL. */
  #isSessionExpired(entry: SessionEntry): boolean {
    if (entry.ttl === "persistent") return false;
    if (entry.ttl === 0) return true;
    return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
  }

  /**
   * Read session entry from storage, handling backward compatibility with bare strings.
   * Returns null if no entry exists.
   */
  async #getSessionEntry(storeKey: string): Promise<SessionEntry | null> {
    const raw = await this.#sessionStorage.get(storeKey);
    if (raw === null) return null;
    return raw as SessionEntry;
  }

  /** Create and store a session entry with current TTL config. */
  async #setSessionEntry(storeKey: string, signature: string): Promise<void> {
    const entry: SessionEntry = {
      signature,
      createdAt: Math.floor(Date.now() / 1000),
      ttl: this.#sessionTTL,
    };
    await this.#sessionStorage.set(storeKey, entry);
  }
```

**Step 2: Update allow() to use SessionEntry and check TTL**

Replace the session storage reads/writes in `allow()`. The key changes:

1. Where `sessionSig` is read (line 135): use `#getSessionEntry()` instead, then check `#isSessionExpired()`.
2. Where session is stored (lines 124, 148, 344): use `#setSessionEntry()` instead.
3. On TTL expiry: delete the entry, emit `SessionExpired`, and fall through to re-sign.

The updated `allow()` session-check block (lines 133-155) becomes:

```typescript
        } else {
          // New format: check session storage
          const sessionEntry = await this.#getSessionEntry(storeKey);
          if (sessionEntry) {
            if (this.#isSessionExpired(sessionEntry)) {
              // Session TTL expired — clear and emit, then fall through to re-sign
              await this.#sessionStorage.delete(storeKey);
              this.#emit({ type: ZamaSDKEvents.SessionExpired, reason: "ttl" });
            } else {
              const creds = await this.#decryptCredentials(encrypted, sessionEntry.signature);
              if (this.#isValid(creds, contractAddresses)) {
                this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
                this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
                return creds;
              }
              this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
            }
          }
          // No session signature or TTL expired — need to re-sign
          if (this.#isValidWithoutDecrypt(encrypted, contractAddresses)) {
            const signature = await this.#sign(encrypted);
            await this.#setSessionEntry(storeKey, signature);
            const creds = await this.#decryptCredentials(encrypted, signature);
            this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
            this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
            return creds;
          }
          this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
        }
```

Also update the legacy migration path (line 124) to use `#setSessionEntry()`:

```typescript
await this.#setSessionEntry(storeKey, encrypted.signature);
```

And in `create()` (line 344):

```typescript
await this.#setSessionEntry(storeKey, signature);
```

**Step 3: Update isAllowed() to check TTL**

Replace the current `isAllowed()`:

```typescript
  async isAllowed(): Promise<boolean> {
    const storeKey = await this.#storeKey();
    const entry = await this.#getSessionEntry(storeKey);
    if (entry === null) return false;
    return !this.#isSessionExpired(entry);
  }
```

**Step 4: Run build to verify**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```
feat(sdk): implement session TTL checking in CredentialsManager
```

---

### Task 4: Write tests for session TTL

**Files:**

- Create: `packages/sdk/src/token/__tests__/session-ttl.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CredentialsManager } from "../credentials-manager";
import { MemoryStorage } from "../memory-storage";
import type { GenericSigner } from "../token.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { ZamaSDKEvent } from "../../events/sdk-events";

function createMockSdk() {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: "0xpub123",
      privateKey: "0xpriv456",
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub123",
        contractAddresses: ["0xtoken"],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
  } as unknown as RelayerSDK;
}

function createMockSigner(address: Address = "0xuser" as Address): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig789"),
    writeContract: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

async function computeStoreKey(address: string, chainId: number = 31337): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
  );
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}

describe("Session TTL", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let store: MemoryStorage;
  let sessionStore: MemoryStorage;
  let events: ZamaSDKEvent[];

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
    store = new MemoryStorage();
    sessionStore = new MemoryStorage();
    events = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createManager(sessionTTL: "persistent" | number = "persistent") {
    return new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: sessionStore,
      durationDays: 7,
      sessionTTL,
      onEvent: (e) => events.push(e),
    });
  }

  it("default (persistent): no time-based expiry", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager();
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance 30 days — session should still be valid
    vi.advanceTimersByTime(30 * 86400 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("numeric TTL: session valid before expiry", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600); // 1 hour
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance 30 minutes — still valid
    vi.advanceTimersByTime(30 * 60 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("numeric TTL: session expired after TTL triggers re-sign and event", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600); // 1 hour
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance past TTL
    vi.advanceTimersByTime(3601 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2); // re-signed

    // SessionExpired event should have fired
    const expiredEvents = events.filter((e) => e.type === "session:expired");
    expect(expiredEvents).toHaveLength(1);
    expect((expiredEvents[0] as { reason: string }).reason).toBe("ttl");
  });

  it("TTL 0: every operation triggers signing prompt", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(0);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
  });

  it("TTL expiry does not clear FHE keypair in persistent storage", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);

    const storeKey = await computeStoreKey("0xuser");
    const storedBefore = await store.get(storeKey);
    expect(storedBefore).not.toBeNull();

    // Expire the session
    vi.advanceTimersByTime(3601 * 1000);
    await manager.allow("0xtoken" as Address);

    // Persistent storage should still have the FHE keypair
    const storedAfter = await store.get(storeKey);
    expect(storedAfter).not.toBeNull();
    // keypair should NOT have been regenerated
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("disconnect before TTL expiry revokes session (existing behavior)", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);

    // Disconnect (revoke) before TTL expires
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
    await manager.revoke();
    expect(await manager.isAllowed()).toBe(false);

    // Next allow should re-sign (not regenerate)
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("isAllowed() returns false when session TTL expired", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);
    expect(await manager.isAllowed()).toBe(true);

    vi.advanceTimersByTime(3601 * 1000);
    expect(await manager.isAllowed()).toBe(false);
  });

  it("config change: old sessions use their recorded TTL", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    // Create session with 1-hour TTL
    const manager1 = createManager(3600);
    await manager1.allow("0xtoken" as Address);

    // Advance 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Create new manager with 10-second TTL (simulates config change)
    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: sessionStore, // same session storage
      durationDays: 7,
      sessionTTL: 10, // shorter TTL
      onEvent: (e) => events.push(e),
    });

    // Old session should still be valid (uses its recorded 3600s TTL)
    await manager2.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("backward compat: bare string in session storage treated as persistent", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // Create credentials first (to populate persistent storage)
    const manager1 = createManager(3600);
    await manager1.allow("0xtoken" as Address);

    // Simulate old-format bare string in session storage
    const storeKey = await computeStoreKey("0xuser");
    await sessionStore.set(storeKey, "0xsig789"); // bare string, old format

    // New manager reads it — should treat as persistent (no expiry)
    vi.advanceTimersByTime(7200 * 1000); // 2 hours past TTL
    const manager2 = createManager(3600);
    await manager2.allow("0xtoken" as Address);
    // Should NOT re-sign — bare string is treated as persistent
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("chain switch with active TTL: independent sessions unaffected", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);

    // Switch chain — new signer returns different chainId
    const signer2 = createMockSigner();
    vi.mocked(signer2.getChainId).mockResolvedValue(1); // mainnet

    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer: signer2,
      storage: store,
      sessionStorage: sessionStore,
      durationDays: 7,
      sessionTTL: 3600,
      onEvent: (e) => events.push(e),
    });

    // Different chain — should generate new credentials
    await manager2.allow("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);

    // Original chain session should still be valid
    vi.advanceTimersByTime(30 * 60 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // original signer, no re-sign
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/session-ttl.test.ts`
Expected: All tests pass.

**Step 3: Run full test suite to verify no regressions**

Run: `npm test`
Expected: All 718+ tests pass (existing tests unaffected by new `sessionTTL` field defaulting in tests).

**Step 4: Commit**

```
test(sdk): add session TTL tests covering all acceptance criteria
```

---

### Task 5: Update API reports and verify build

**Files:**

- Modify: `packages/sdk/etc/sdk.api.md` (auto-generated)
- Modify: `packages/react-sdk/etc/react-sdk.api.md` (auto-generated)
- Modify: `packages/react-sdk/etc/react-sdk-wagmi.api.md` (auto-generated)

**Step 1: Rebuild and regenerate API reports**

Run: `npm run build`
Expected: Build succeeds.

**Step 2: Run API extractor**

Run: `npm run api` (or the api-extractor command used in this project)
Expected: API reports updated with new `SessionTTL` type and `SessionExpiredEvent`.

**Step 3: Run full tests one final time**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit**

```
chore(sdk): update API reports for session TTL feature
```
