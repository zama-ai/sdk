# EIP-1193 Signer Subscribe Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `subscribe()` to ViemSigner and EthersSigner so wallet disconnect/account-change events auto-revoke sessions, matching WagmiSigner behavior.

**Architecture:** Both signers accept an optional EIP-1193 provider in their config. When present, `subscribe` is conditionally assigned in the constructor using standard `accountsChanged` and `disconnect` events. No shared abstraction — each signer wires events inline (~10 lines each).

**Tech Stack:** TypeScript, vitest, EIP-1193

---

### Task 1: Add `EIP1193Provider` type to token.types.ts

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts:37-45` (before `SignerLifecycleCallbacks`)
- Modify: `packages/sdk/src/index.ts` (add export)

**Step 1: Add the EIP1193Provider interface**

In `packages/sdk/src/token/token.types.ts`, add just before the `SignerLifecycleCallbacks` interface (line 40):

```typescript
/**
 * Minimal EIP-1193 provider interface for subscribing to wallet events.
 * Pass this to ViemSigner/EthersSigner to enable automatic session revocation.
 */
export interface EIP1193Provider {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}
```

**Step 2: Export from barrel**

In `packages/sdk/src/index.ts`, add `EIP1193Provider` to the existing export block that contains `SignerLifecycleCallbacks`.

**Step 3: Commit**

```bash
git add packages/sdk/src/token/token.types.ts packages/sdk/src/index.ts
git commit -m "feat: add EIP1193Provider type for signer subscribe support"
```

---

### Task 2: Add subscribe to ViemSigner (tests first)

**Files:**

- Test: `packages/sdk/src/viem/__tests__/viem.test.ts`
- Modify: `packages/sdk/src/viem/viem-signer.ts`

**Step 1: Write failing tests**

Add a new `describe("subscribe")` block inside the existing `describe("ViemSigner")` in `packages/sdk/src/viem/__tests__/viem.test.ts`. Add the import for `EIP1193Provider` from `../../token/token.types`.

Create a mock EIP-1193 provider factory:

```typescript
function createMockEIP1193Provider(): EIP1193Provider & {
  _trigger: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(listener);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      const arr = listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(listener);
        if (idx !== -1) arr.splice(idx, 1);
      }
    },
    _trigger(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) fn(...args);
    },
  };
}
```

Tests:

```typescript
describe("subscribe", () => {
  it("is not defined when no provider is given", () => {
    const signer = new ViemSigner({ walletClient, publicClient });
    expect(signer.subscribe).toBeUndefined();
  });

  it("calls onDisconnect when disconnect event fires", () => {
    const provider = createMockEIP1193Provider();
    const signer = new ViemSigner({ walletClient, publicClient, provider });
    const onDisconnect = vi.fn();
    signer.subscribe!({ onDisconnect });

    provider._trigger("disconnect");
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("calls onDisconnect when accountsChanged fires with empty array", () => {
    const provider = createMockEIP1193Provider();
    const signer = new ViemSigner({ walletClient, publicClient, provider });
    const onDisconnect = vi.fn();
    signer.subscribe!({ onDisconnect });

    provider._trigger("accountsChanged", []);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("calls onAccountChange when accountsChanged fires with a different address", async () => {
    const provider = createMockEIP1193Provider();
    const signer = new ViemSigner({ walletClient, publicClient, provider });
    const onAccountChange = vi.fn();
    signer.subscribe!({ onAccountChange });

    // Wait for the async getAddress to resolve
    await vi.waitFor(() => {});

    const NEW_ADDR = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    provider._trigger("accountsChanged", [NEW_ADDR]);
    expect(onAccountChange).toHaveBeenCalledWith(NEW_ADDR);
  });

  it("does not call onAccountChange when address is the same", async () => {
    const provider = createMockEIP1193Provider();
    const signer = new ViemSigner({ walletClient, publicClient, provider });
    const onAccountChange = vi.fn();
    signer.subscribe!({ onAccountChange });

    await vi.waitFor(() => {});

    provider._trigger("accountsChanged", [ACCOUNT_ADDRESS]);
    expect(onAccountChange).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function that removes listeners", () => {
    const provider = createMockEIP1193Provider();
    const signer = new ViemSigner({ walletClient, publicClient, provider });
    const onDisconnect = vi.fn();
    const unsubscribe = signer.subscribe!({ onDisconnect });

    unsubscribe();
    provider._trigger("disconnect");
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/sdk/src/viem/__tests__/viem.test.ts`
Expected: FAIL — `subscribe` is undefined / not implemented.

**Step 3: Implement subscribe in ViemSigner**

In `packages/sdk/src/viem/viem-signer.ts`:

1. Import `EIP1193Provider`, `SignerLifecycleCallbacks`, and `Address` from the types.
2. Add `provider?: EIP1193Provider` to `ViemSignerConfig`.
3. Store `this.provider` in the constructor.
4. Conditionally assign `subscribe` in the constructor:

```typescript
constructor(config: ViemSignerConfig) {
  this.walletClient = config.walletClient;
  this.publicClient = config.publicClient;

  if (config.provider) {
    const provider = config.provider;
    this.subscribe = ({
      onDisconnect = () => {},
      onAccountChange = () => {},
    }: SignerLifecycleCallbacks): (() => void) => {
      let currentAddress: string | undefined;
      this.getAddress()
        .then((addr) => { currentAddress = addr; })
        .catch(() => {});

      const handleAccountsChanged = (accounts: unknown) => {
        const addrs = accounts as string[];
        if (addrs.length === 0) {
          onDisconnect();
        } else if (
          currentAddress &&
          addrs[0] &&
          addrs[0].toLowerCase() !== currentAddress.toLowerCase()
        ) {
          currentAddress = addrs[0];
          onAccountChange(addrs[0] as Address);
        }
      };

      const handleDisconnect = () => { onDisconnect(); };

      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("disconnect", handleDisconnect);

      return () => {
        provider.removeListener("accountsChanged", handleAccountsChanged);
        provider.removeListener("disconnect", handleDisconnect);
      };
    };
  }
}
```

Add the optional property declaration to the class body:

```typescript
subscribe?: GenericSigner["subscribe"];
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/sdk/src/viem/__tests__/viem.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/viem/viem-signer.ts packages/sdk/src/viem/__tests__/viem.test.ts
git commit -m "feat(viem): add subscribe for EIP-1193 wallet lifecycle events"
```

---

### Task 3: Add subscribe to EthersSigner (tests first)

**Files:**

- Test: `packages/sdk/src/ethers/__tests__/ethers.test.ts`
- Modify: `packages/sdk/src/ethers/ethers-signer.ts`

**Step 1: Write failing tests**

Add a new `describe("subscribe")` block inside the existing `describe("EthersSigner")` in `packages/sdk/src/ethers/__tests__/ethers.test.ts`. Add the import for `EIP1193Provider` from `../../token/token.types`.

Use the same `createMockEIP1193Provider` factory as Task 2.

Tests:

```typescript
describe("subscribe", () => {
  it("is not defined when no provider is given", () => {
    const signer = createMockSigner();
    const ethersSigner = new EthersSigner({ signer: signer as never });
    expect(ethersSigner.subscribe).toBeUndefined();
  });

  it("calls onDisconnect when disconnect event fires", () => {
    const mockSigner = createMockSigner();
    const provider = createMockEIP1193Provider();
    const ethersSigner = new EthersSigner({ signer: mockSigner as never, provider });
    const onDisconnect = vi.fn();
    ethersSigner.subscribe!({ onDisconnect });

    provider._trigger("disconnect");
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("calls onDisconnect when accountsChanged fires with empty array", () => {
    const mockSigner = createMockSigner();
    const provider = createMockEIP1193Provider();
    const ethersSigner = new EthersSigner({ signer: mockSigner as never, provider });
    const onDisconnect = vi.fn();
    ethersSigner.subscribe!({ onDisconnect });

    provider._trigger("accountsChanged", []);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("calls onAccountChange when accountsChanged fires with a different address", async () => {
    const mockSigner = createMockSigner();
    const provider = createMockEIP1193Provider();
    const ethersSigner = new EthersSigner({ signer: mockSigner as never, provider });
    const onAccountChange = vi.fn();
    ethersSigner.subscribe!({ onAccountChange });

    await vi.waitFor(() => {});

    const NEW_ADDR = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    provider._trigger("accountsChanged", [NEW_ADDR]);
    expect(onAccountChange).toHaveBeenCalledWith(NEW_ADDR);
  });

  it("returns an unsubscribe function that removes listeners", () => {
    const mockSigner = createMockSigner();
    const provider = createMockEIP1193Provider();
    const ethersSigner = new EthersSigner({ signer: mockSigner as never, provider });
    const onDisconnect = vi.fn();
    const unsubscribe = ethersSigner.subscribe!({ onDisconnect });

    unsubscribe();
    provider._trigger("disconnect");
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/sdk/src/ethers/__tests__/ethers.test.ts`
Expected: FAIL — `subscribe` is undefined.

**Step 3: Implement subscribe in EthersSigner**

In `packages/sdk/src/ethers/ethers-signer.ts`:

1. Import `EIP1193Provider`, `SignerLifecycleCallbacks` from the types. `Address` is already imported.
2. Add `provider?: EIP1193Provider` to `EthersSignerConfig`.
3. Conditionally assign `subscribe` in the constructor (same pattern as ViemSigner).

```typescript
constructor(config: EthersSignerConfig) {
  const providerOrSigner = config.signer;
  if ("getSigner" in providerOrSigner) {
    this.signerPromise = providerOrSigner.getSigner();
  } else {
    this.signerPromise = Promise.resolve(providerOrSigner);
  }

  if (config.provider) {
    const provider = config.provider;
    this.subscribe = ({
      onDisconnect = () => {},
      onAccountChange = () => {},
    }: SignerLifecycleCallbacks): (() => void) => {
      let currentAddress: string | undefined;
      this.getAddress()
        .then((addr) => { currentAddress = addr; })
        .catch(() => {});

      const handleAccountsChanged = (accounts: unknown) => {
        const addrs = accounts as string[];
        if (addrs.length === 0) {
          onDisconnect();
        } else if (
          currentAddress &&
          addrs[0] &&
          addrs[0].toLowerCase() !== currentAddress.toLowerCase()
        ) {
          currentAddress = addrs[0];
          onAccountChange(addrs[0] as Address);
        }
      };

      const handleDisconnect = () => { onDisconnect(); };

      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("disconnect", handleDisconnect);

      return () => {
        provider.removeListener("accountsChanged", handleAccountsChanged);
        provider.removeListener("disconnect", handleDisconnect);
      };
    };
  }
}
```

Add the optional property declaration to the class body:

```typescript
subscribe?: GenericSigner["subscribe"];
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/sdk/src/ethers/__tests__/ethers.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/ethers/ethers-signer.ts packages/sdk/src/ethers/__tests__/ethers.test.ts
git commit -m "feat(ethers): add subscribe for EIP-1193 wallet lifecycle events"
```

---

### Task 4: Run full test suite and update API reports

**Files:**

- Check: `packages/sdk/etc/sdk.api.md`, `packages/sdk/etc/sdk-node.api.md`

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Update API reports if needed**

Run: `npx turbo build` (or whatever builds the API extractor reports)
Check if `etc/sdk.api.md` or `etc/sdk-node.api.md` changed. If so, stage and commit:

```bash
git add packages/sdk/etc/sdk.api.md packages/sdk/etc/sdk-node.api.md
git commit -m "docs: update API reports for EIP-1193 subscribe"
```
