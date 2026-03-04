# Session Revoke Identity Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix auto-revoke to clear the correct session key on account change/disconnect by tracking last-known signer identity.

**Architecture:** Extract `computeStoreKey(address, chainId)` from `CredentialsManager` so `ZamaSDK` can compute store keys without a signer. Track `{address, chainId}` in `ZamaSDK` via a lazy init promise, and use the tracked identity in lifecycle callbacks before the signer state changes.

**Tech Stack:** TypeScript, vitest, Web Crypto API (SHA-256)

---

### Task 1: Extract `computeStoreKey` helper

**Files:**

- Modify: `packages/sdk/src/token/credentials-manager.ts:250-262`

**Step 1: Write the failing test**

Create a test for the new exported function:

```typescript
// In packages/sdk/src/token/__tests__/compute-store-key.test.ts
import { describe, it, expect } from "vitest";
import { computeStoreKey } from "../credentials-manager";

describe("computeStoreKey", () => {
  it("returns a 32-char hex hash of address:chainId", async () => {
    const key = await computeStoreKey("0xUser", 31337);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("normalizes address to lowercase", async () => {
    const a = await computeStoreKey("0xABC", 1);
    const b = await computeStoreKey("0xabc", 1);
    expect(a).toBe(b);
  });

  it("differs for different chainIds", async () => {
    const a = await computeStoreKey("0xuser", 1);
    const b = await computeStoreKey("0xuser", 31337);
    expect(a).not.toBe(b);
  });

  it("matches the key CredentialsManager would derive", async () => {
    // Reproduce the original inline computation to prove equivalence
    const address = "0xuser";
    const chainId = 31337;
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expected = hex.slice(0, 32);

    expect(await computeStoreKey(address, chainId)).toBe(expected);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/compute-store-key.test.ts`
Expected: FAIL — `computeStoreKey` is not exported from `credentials-manager`

**Step 3: Implement `computeStoreKey` and refactor `#storeKey`**

In `packages/sdk/src/token/credentials-manager.ts`, add above the class:

```typescript
/** Compute the storage key for a given address + chainId (SHA-256 truncated to 32 hex chars). */
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

Then replace `CredentialsManager.#storeKey()` body to delegate:

```typescript
async #storeKey(): Promise<string> {
  const address = await this.#signer.getAddress();
  const chainId = await this.#signer.getChainId();
  return computeStoreKey(address, chainId);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/compute-store-key.test.ts`
Expected: PASS

**Step 5: Run existing tests to verify no regression**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/credentials-manager.test.ts src/token/__tests__/zama-sdk.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/credentials-manager.ts packages/sdk/src/token/__tests__/compute-store-key.test.ts
git commit -m "refactor: extract computeStoreKey helper from CredentialsManager"
```

---

### Task 2: Add identity tracking and `#revokeByTrackedIdentity` to ZamaSDK

**Files:**

- Modify: `packages/sdk/src/token/zama-sdk.ts`

**Step 1: Write the failing tests**

Add these tests to `packages/sdk/src/token/__tests__/zama-sdk.test.ts`:

```typescript
import { computeStoreKey } from "../credentials-manager";

describe("lifecycle auto-revoke", () => {
  it("onAccountChange revokes the PREVIOUS account session, not the new one", async () => {
    const sessionStorage = new MemoryStorage();
    let subscribeCbs: { onDisconnect: () => void; onAccountChange: (addr: string) => void };

    const signer = {
      ...createMockSigner(), // getAddress returns "0xuser" (account A)
      subscribe: vi.fn((cbs: any) => {
        subscribeCbs = cbs;
        return () => {};
      }),
    };

    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer,
      storage: new MemoryStorage(),
      sessionStorage,
    });

    // Seed account A's session
    const keyA = await computeStoreKey("0xuser", 31337);
    await sessionStorage.set(keyA, "0xsigA");

    // Simulate account change: signer now reports account B
    signer.getAddress.mockResolvedValue("0xnewuser");

    // Trigger the lifecycle callback with the NEW address
    subscribeCbs!.onAccountChange("0xnewuser");

    // Wait for async revoke to complete
    await vi.waitFor(async () => {
      expect(await sessionStorage.get(keyA)).toBeNull();
    });

    // Account B's key should be untouched (it was never seeded)
    const keyB = await computeStoreKey("0xnewuser", 31337);
    expect(await sessionStorage.get(keyB)).toBeNull();

    sdk.terminate();
  });

  it("A→B→A: both account sessions are revoked on their respective switches", async () => {
    const sessionStorage = new MemoryStorage();
    let subscribeCbs: { onDisconnect: () => void; onAccountChange: (addr: string) => void };

    const signer = {
      ...createMockSigner(), // starts as 0xuser (A)
      subscribe: vi.fn((cbs: any) => {
        subscribeCbs = cbs;
        return () => {};
      }),
    };

    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer,
      storage: new MemoryStorage(),
      sessionStorage,
    });

    const keyA = await computeStoreKey("0xuser", 31337);
    const keyB = await computeStoreKey("0xnewuser", 31337);

    // A has a session
    await sessionStorage.set(keyA, "0xsigA");

    // Switch A → B
    signer.getAddress.mockResolvedValue("0xnewuser");
    subscribeCbs!.onAccountChange("0xnewuser");
    await vi.waitFor(async () => {
      expect(await sessionStorage.get(keyA)).toBeNull();
    });

    // B gets a session
    await sessionStorage.set(keyB, "0xsigB");

    // Switch B → A
    signer.getAddress.mockResolvedValue("0xuser");
    subscribeCbs!.onAccountChange("0xuser");
    await vi.waitFor(async () => {
      expect(await sessionStorage.get(keyB)).toBeNull();
    });

    sdk.terminate();
  });

  it("onDisconnect revokes the current account session", async () => {
    const sessionStorage = new MemoryStorage();
    let subscribeCbs: { onDisconnect: () => void; onAccountChange: (addr: string) => void };

    const signer = {
      ...createMockSigner(),
      subscribe: vi.fn((cbs: any) => {
        subscribeCbs = cbs;
        return () => {};
      }),
    };

    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer,
      storage: new MemoryStorage(),
      sessionStorage,
    });

    const keyA = await computeStoreKey("0xuser", 31337);
    await sessionStorage.set(keyA, "0xsigA");

    // Signer may throw on getAddress after disconnect
    signer.getAddress.mockRejectedValue(new Error("disconnected"));

    subscribeCbs!.onDisconnect();
    await vi.waitFor(async () => {
      expect(await sessionStorage.get(keyA)).toBeNull();
    });

    sdk.terminate();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/zama-sdk.test.ts`
Expected: FAIL — onAccountChange revokes wrong key; onDisconnect fails when signer throws

**Step 3: Implement identity tracking in ZamaSDK**

Modify `packages/sdk/src/token/zama-sdk.ts`:

```typescript
import { computeStoreKey } from "./credentials-manager";

export class ZamaSDK {
  // ... existing fields ...
  #identityReady: Promise<void>;
  #lastAddress: string | null = null;
  #lastChainId: number | null = null;

  constructor(config: ZamaSDKConfig) {
    // ... existing init ...

    // Eagerly capture current identity (non-blocking)
    this.#identityReady = this.#initIdentity();

    if (this.signer.subscribe) {
      this.#unsubscribeSigner = this.signer.subscribe({
        onDisconnect: () => {
          void this.#revokeByTrackedIdentity().then(() => {
            this.#lastAddress = null;
            this.#lastChainId = null;
          });
        },
        onAccountChange: (newAddress: Address) => {
          void this.#revokeByTrackedIdentity().then(() => {
            this.#lastAddress = newAddress.toLowerCase();
          });
        },
      });
    }
  }

  async #initIdentity(): Promise<void> {
    try {
      this.#lastAddress = (await this.signer.getAddress()).toLowerCase();
      this.#lastChainId = await this.signer.getChainId();
    } catch {
      // Signer not ready yet — will be set on first lifecycle event
    }
  }

  async #revokeByTrackedIdentity(): Promise<void> {
    await this.#identityReady;
    if (this.#lastAddress == null || this.#lastChainId == null) return;
    const storeKey = await computeStoreKey(this.#lastAddress, this.#lastChainId);
    await this.sessionStorage.delete(storeKey);
    this.#onEvent?.({
      type: ZamaSDKEvents.CredentialsRevoked,
      timestamp: Date.now(),
    } as never);
  }

  // ... rest unchanged ...
}
```

Also add the `ZamaSDKEvents` import:

```typescript
import { ZamaSDKEvents } from "../events/sdk-events";
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/token/__tests__/zama-sdk.test.ts`
Expected: All PASS

**Step 5: Run full test suite to verify no regression**

Run: `cd packages/sdk && npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/zama-sdk.ts packages/sdk/src/token/__tests__/zama-sdk.test.ts
git commit -m "fix: revoke correct session key on account change/disconnect

Track last-known {address, chainId} in ZamaSDK and use it for lifecycle
auto-revoke instead of reading from signer (which already reports the
new identity at callback time).

Closes review comment by @ankurdotb on PR #25."
```

---

### Task 3: Update API reports

**Files:**

- Modify: `packages/sdk/etc/sdk.api.md`
- Modify: `packages/sdk/etc/sdk-node.api.md`

**Step 1: Regenerate API reports**

Run: `cd packages/sdk && npx api-extractor run --local`

**Step 2: Verify the only change is the new `computeStoreKey` export**

Run: `git diff packages/sdk/etc/`

Expected: `computeStoreKey` appears as a new exported function. No other unexpected changes.

**Step 3: Commit**

```bash
git add packages/sdk/etc/
git commit -m "docs: update API reports for computeStoreKey export"
```

---

### Task 4: Final verification

**Step 1: Run full SDK test suite**

Run: `cd packages/sdk && npx vitest run`
Expected: All PASS

**Step 2: Run type check**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: No errors

**Step 3: Verify no unintended public API changes**

Run: `git diff main -- packages/sdk/etc/sdk.api.md | head -60`
Expected: Only `computeStoreKey` addition + the lifecycle fix (no removed exports, no broken signatures)
