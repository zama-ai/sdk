# Batch Delegated Decryption Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `DelegatedCredentialsManager` for cached delegated credentials and `batchDecryptBalancesAs` for batch delegated decryption across multiple tokens.

**Architecture:** New `DelegatedCredentialsManager` class mirrors `CredentialsManager` but uses `createDelegatedUserDecryptEIP712` / `delegatedUserDecrypt` and keys credentials by `(delegate, delegator, chainId)`. `batchDecryptBalancesAs` mirrors `batchDecryptBalances` using delegated credentials. `decryptBalanceAs` gets an optional `credentials` param.

**Tech Stack:** TypeScript, vitest, viem (Address/Hex types), TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-12-batch-decrypt-balances-as-design.md`

---

## File Structure

| Action | File                                                                     | Responsibility                                                                                                          |
| ------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Modify | `packages/sdk/src/token/token.types.ts`                                  | Add `DelegatedStoredCredentials` type                                                                                   |
| Create | `packages/sdk/src/token/delegated-credentials-manager.ts`                | `DelegatedCredentialsManager` class + config/types                                                                      |
| Create | `packages/sdk/src/token/__tests__/delegated-credentials-manager.test.ts` | Unit tests for delegated creds manager                                                                                  |
| Modify | `packages/sdk/src/token/readonly-token.ts`                               | Add `batchDecryptBalancesAs` static + update `decryptBalanceAs`                                                         |
| Create | `packages/sdk/src/token/__tests__/batch-decrypt-as.test.ts`              | Tests for `batchDecryptBalancesAs`                                                                                      |
| Modify | `packages/sdk/src/token/__tests__/delegation.test.ts`                    | Tests for updated `decryptBalanceAs` with credentials param                                                             |
| Modify | `packages/sdk/src/query/decrypt-balance-as.ts`                           | Update `DecryptBalanceAsParams` to include optional `credentials`                                                       |
| Create | `packages/sdk/src/query/batch-decrypt-balances-as.ts`                    | `batchDecryptBalancesAsMutationOptions` query factory                                                                   |
| Modify | `packages/sdk/src/query/index.ts`                                        | Export new query options + types                                                                                        |
| Modify | `packages/sdk/src/index.ts`                                              | Export `DelegatedCredentialsManager` + config type + `BatchDecryptAsOptions` + `DelegatedStoredCredentials`             |
| Modify | `packages/sdk/src/test-fixtures.ts`                                      | Add `createDelegatedCredentialManager` fixture                                                                          |
| Create | `packages/react-sdk/src/token/use-batch-decrypt-balances-as.ts`          | `useBatchDecryptBalancesAs` hook                                                                                        |
| Modify | `packages/react-sdk/src/index.ts`                                        | Export new hook + re-export `DelegatedCredentialsManager`, `DelegatedCredentialsManagerConfig`, `BatchDecryptAsOptions` |

Note: `packages/react-sdk/src/token/use-decrypt-balance-as.ts` does NOT need modification — it passes params through to `decryptBalanceAsMutationOptions` which already handles the `credentials` field via `DecryptBalanceAsParams`.

---

## Chunk 1: DelegatedCredentialsManager

### Task 1: DelegatedStoredCredentials type

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts`

- [ ] **Step 1: Add `DelegatedStoredCredentials` interface**

Add after `StoredCredentials` (line ~181):

```ts
/** Stored FHE credential data for delegated decryption. */
export interface DelegatedStoredCredentials extends StoredCredentials {
  /** The address that granted delegation rights. */
  delegatorAddress: Address;
  /** The delegate address performing decryption on behalf of the delegator. */
  delegateAddress: Address;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/token/token.types.ts
git commit -m "feat: add DelegatedStoredCredentials type"
```

### Task 2: DelegatedCredentialsManager — full implementation with tests (TDD)

**Files:**

- Create: `packages/sdk/src/token/__tests__/delegated-credentials-manager.test.ts`
- Create: `packages/sdk/src/token/delegated-credentials-manager.ts`

- [ ] **Step 1: Write all failing tests (core + lifecycle)**

Create `packages/sdk/src/token/__tests__/delegated-credentials-manager.test.ts`:

```ts
import { describe, expect, vi, afterEach, beforeEach } from "vitest";
import { test, createMockRelayer, createMockSigner, createMockStorage } from "../../test-fixtures";
import { DelegatedCredentialsManager } from "../delegated-credentials-manager";
import type { Address } from "viem";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;

function mockDelegatedEIP712(relayer: ReturnType<typeof createMockRelayer>) {
  vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
    domain: { name: "test", version: "1", chainId: 31337n, verifyingContract: "0xkms" },
    types: { DelegatedUserDecryptRequestVerification: [] },
    message: {
      publicKey: "0xpub",
      contractAddresses: [TOKEN_A],
      delegatorAddress: DELEGATOR,
      startTimestamp: "1000",
      durationDays: "1",
      extraData: "0x",
    },
  } as never);
}

function createManager(
  relayer: ReturnType<typeof createMockRelayer>,
  overrides: { sessionTTL?: number } = {},
) {
  const signer = createMockSigner(DELEGATE);
  const storage = createMockStorage();
  const sessionStorage = createMockStorage();
  mockDelegatedEIP712(relayer);

  return {
    manager: new DelegatedCredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 86400,
      sessionTTL: overrides.sessionTTL ?? 2592000,
    }),
    signer,
    storage,
    sessionStorage,
  };
}

describe("DelegatedCredentialsManager", () => {
  // Core allow() tests
  test("allow() generates fresh credentials for a delegator", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer);

    const creds = await manager.allow(DELEGATOR, TOKEN_A);

    expect(creds.delegatorAddress).toBe(DELEGATOR);
    expect(creds.delegateAddress).toBe(DELEGATE);
    expect(creds.publicKey).toBe("0xpub");
    expect(creds.contractAddresses).toContain(TOKEN_A);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  test("allow() returns cached credentials on second call", async ({ relayer }) => {
    const { manager } = createManager(relayer);

    const creds1 = await manager.allow(DELEGATOR, TOKEN_A);
    const creds2 = await manager.allow(DELEGATOR, TOKEN_A);

    expect(creds1.publicKey).toBe(creds2.publicKey);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
  });

  test("allow() extends contract set for new tokens", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    const creds = await manager.allow(DELEGATOR, TOKEN_A, TOKEN_B);

    expect(creds.contractAddresses).toContain(TOKEN_A);
    expect(creds.contractAddresses).toContain(TOKEN_B);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  test("different delegators get separate credentials", async ({ relayer }) => {
    const OTHER_DELEGATOR = "0xdDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd" as Address;
    const { manager } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    await manager.allow(OTHER_DELEGATOR, TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
  });

  // Lifecycle tests
  test("revoke() clears session, next allow() re-signs", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    await manager.revoke(DELEGATOR);
    await manager.allow(DELEGATOR, TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  test("isAllowed() returns true when session exists", async ({ relayer }) => {
    const { manager } = createManager(relayer);

    expect(await manager.isAllowed(DELEGATOR)).toBe(false);
    await manager.allow(DELEGATOR, TOKEN_A);
    expect(await manager.isAllowed(DELEGATOR)).toBe(true);
    await manager.revoke(DELEGATOR);
    expect(await manager.isAllowed(DELEGATOR)).toBe(false);
  });

  test("clear() removes all stored credentials", async ({ relayer }) => {
    const { manager } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    await manager.clear(DELEGATOR);
    await manager.allow(DELEGATOR, TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
  });

  test("sessionTTL: 0 means never expire", async ({ relayer }) => {
    vi.useFakeTimers();
    try {
      const { manager } = createManager(relayer, { sessionTTL: 0 });

      await manager.allow(DELEGATOR, TOKEN_A);

      // Advance time by 10 years
      vi.advanceTimersByTime(10 * 365 * 86400 * 1000);

      // Session should still be valid
      expect(await manager.isAllowed(DELEGATOR)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/sdk/src/token/__tests__/delegated-credentials-manager.test.ts`
Expected: FAIL — cannot resolve `../delegated-credentials-manager`

- [ ] **Step 3: Implement `DelegatedCredentialsManager`**

Create `packages/sdk/src/token/delegated-credentials-manager.ts`. Follow the same patterns as `CredentialsManager` (see `packages/sdk/src/token/credentials-manager.ts`):

- Constructor takes `DelegatedCredentialsManagerConfig` (same shape as `CredentialsManagerConfig`)
- Store key = `hash(delegateAddress, delegatorAddress, chainId)` via `signer.getAddress()` + `signer.getChainId()`
- `allow(delegatorAddress, ...contractAddresses)` → returns `DelegatedStoredCredentials`
- Uses `relayer.createDelegatedUserDecryptEIP712(publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays)` instead of `createEIP712`
- `durationDays = Math.ceil(keypairTTL / 86400)`
- Same AES-GCM encryption for private key persistence
- Same session entry storage with TTL
- Same contract extension pattern (#extendContracts) — re-sign with `createDelegatedUserDecryptEIP712`, reuse existing keypair and `startTimestamp`
- `isExpired(delegatorAddress, contractAddress?)`, `revoke(delegatorAddress)`, `clear(delegatorAddress)`, `isAllowed(delegatorAddress)`
- Signs the delegated EIP-712 by converting KMS types: `chainId → Number`, `startTimestamp → BigInt`, `durationDays → BigInt`

Key differences from `CredentialsManager`:

- Store key includes `delegatorAddress` in the hash
- EIP-712 creation uses `createDelegatedUserDecryptEIP712` (extra `delegatorAddress` param)
- Returned credentials include `delegatorAddress` and `delegateAddress`
- `#isSessionExpired` returns `false` when `ttl === 0` (infinite session — opposite of `CredentialsManager` which treats `0` as "expired immediately")

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/sdk/src/token/__tests__/delegated-credentials-manager.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/token/delegated-credentials-manager.ts packages/sdk/src/token/__tests__/delegated-credentials-manager.test.ts
git commit -m "feat: add DelegatedCredentialsManager with caching and contract extension"
```

### Task 3: Export DelegatedCredentialsManager + test fixtures

**Files:**

- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/test-fixtures.ts`

- [ ] **Step 1: Add exports to `packages/sdk/src/index.ts`**

After line 66 (`export type { CredentialsManagerConfig } ...`), add:

```ts
export { DelegatedCredentialsManager } from "./token/delegated-credentials-manager";
export type { DelegatedCredentialsManagerConfig } from "./token/delegated-credentials-manager";
```

Add `DelegatedStoredCredentials` to the type exports. Find the existing exports block and add:

```ts
export type { DelegatedStoredCredentials } from "./token/token.types";
```

- [ ] **Step 2: Add test fixtures to `packages/sdk/src/test-fixtures.ts`**

Add import at top:

```ts
import {
  DelegatedCredentialsManager,
  DelegatedCredentialsManagerConfig,
} from "./token/delegated-credentials-manager";
```

Add to `SdkFixtures` interface:

```ts
delegatedCredentialManager: DelegatedCredentialsManager;
createDelegatedCredentialManager: (config: DelegatedCredentialsManagerConfig) =>
  DelegatedCredentialsManager;
```

Add fixture implementations:

```ts
createDelegatedCredentialManager: async ({}, use) => {
  function factory(config: DelegatedCredentialsManagerConfig) {
    return new DelegatedCredentialsManager({
      relayer: config.relayer,
      signer: config.signer,
      storage: config.storage,
      sessionStorage: config.sessionStorage,
      keypairTTL: config.keypairTTL ?? 86400,
      sessionTTL: config.sessionTTL ?? 2592000,
      onEvent: config.onEvent,
    });
  }
  await use(factory);
},
delegatedCredentialManager: async (
  { relayer, signer, storage, sessionStorage, createDelegatedCredentialManager },
  use,
) => {
  await use(
    createDelegatedCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 86400,
      sessionTTL: 2592000,
    }),
  );
},
```

- [ ] **Step 3: Run all tests to verify no regressions**

Run: `npx vitest run --project sdk --project react-sdk`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/index.ts packages/sdk/src/test-fixtures.ts
git commit -m "feat: export DelegatedCredentialsManager + add test fixtures"
```

---

## Chunk 2: batchDecryptBalancesAs + decryptBalanceAs update

### Task 4: Update `decryptBalanceAs` to accept optional credentials (TDD)

**Files:**

- Modify: `packages/sdk/src/token/__tests__/delegation.test.ts`
- Modify: `packages/sdk/src/token/readonly-token.ts`
- Modify: `packages/sdk/src/query/decrypt-balance-as.ts`

- [ ] **Step 1: Add test for `decryptBalanceAs` with credentials param**

Add a new test to `packages/sdk/src/token/__tests__/delegation.test.ts` (find the `decryptBalanceAs` describe block):

```ts
test("decryptBalanceAs uses DelegatedCredentialsManager when provided", async ({
  readonlyToken,
  relayer,
  delegatorAddress,
  handle,
}) => {
  vi.mocked(readonlyToken.signer.readContract).mockResolvedValue(handle);
  vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({
    [handle]: 500n,
  });

  const mockCredentials = {
    allow: vi.fn().mockResolvedValue({
      publicKey: "0xpub",
      privateKey: "0xpriv",
      signature: "0xsig",
      contractAddresses: [readonlyToken.address],
      startTimestamp: Math.floor(Date.now() / 1000),
      durationDays: 1,
      delegatorAddress,
      delegateAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
    }),
  };

  const result = await readonlyToken.decryptBalanceAs({
    delegatorAddress,
    credentials: mockCredentials as never,
  });

  expect(result).toBe(500n);
  expect(mockCredentials.allow).toHaveBeenCalledWith(delegatorAddress, readonlyToken.address);
  expect(relayer.generateKeypair).not.toHaveBeenCalled();
  expect(relayer.createDelegatedUserDecryptEIP712).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/sdk/src/token/__tests__/delegation.test.ts -t "uses DelegatedCredentialsManager"`
Expected: FAIL — `credentials` param not recognized

- [ ] **Step 3: Update `decryptBalanceAs` in `readonly-token.ts`**

Modify the method signature at line ~555 to accept optional `credentials`:

```ts
async decryptBalanceAs({
  delegatorAddress,
  owner,
  credentials,
}: {
  delegatorAddress: Address;
  owner?: Address;
  credentials?: { allow(delegatorAddress: Address, ...contractAddresses: Address[]): Promise<import("./token.types").DelegatedStoredCredentials> };
}): Promise<bigint> {
```

Add a branch after the cache check (after line ~577 `if (cached !== null) return cached;`):

```ts
if (credentials) {
  const t0 = Date.now();
  try {
    this.emit({ type: ZamaSDKEvents.DecryptStart });

    const creds = await credentials.allow(delegatorAddress, this.address);

    const result = await this.relayer.delegatedUserDecrypt({
      handles: [handle],
      contractAddress: this.address,
      signedContractAddresses: creds.contractAddresses,
      privateKey: creds.privateKey,
      publicKey: creds.publicKey,
      signature: creds.signature,
      delegatorAddress: creds.delegatorAddress,
      delegateAddress: creds.delegateAddress,
      startTimestamp: creds.startTimestamp,
      durationDays: creds.durationDays,
    });

    this.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 });

    const value = result[handle] as bigint | undefined;
    if (value === undefined) {
      throw new DecryptionFailedError(
        `Delegated decryption returned no value for handle ${handle}`,
      );
    }

    await saveCachedBalance({
      storage: this.storage,
      tokenAddress: this.address,
      owner: normalizedOwner,
      handle,
      value,
    });

    return value;
  } catch (error) {
    this.emit({
      type: ZamaSDKEvents.DecryptError,
      error: toError(error),
      durationMs: Date.now() - t0,
    });
    throw wrapDecryptError(error, "Failed to decrypt delegated balance");
  }
}
```

- [ ] **Step 4: Update `DecryptBalanceAsParams`**

In `packages/sdk/src/query/decrypt-balance-as.ts`, add optional `credentials` to the params:

```ts
import type { DelegatedStoredCredentials } from "../token/token.types";

export interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  owner?: Address;
  credentials?: {
    allow(
      delegatorAddress: Address,
      ...contractAddresses: Address[]
    ): Promise<DelegatedStoredCredentials>;
  };
}
```

Update the mutation function to pass `credentials` through:

```ts
mutationFn: async ({ delegatorAddress, owner, credentials }) =>
  readonlyToken.decryptBalanceAs({ delegatorAddress, owner, credentials }),
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts packages/sdk/src/query/decrypt-balance-as.ts packages/sdk/src/token/__tests__/delegation.test.ts
git commit -m "feat: add optional credentials param to decryptBalanceAs"
```

### Task 5: `batchDecryptBalancesAs` static method (TDD)

**Files:**

- Create: `packages/sdk/src/token/__tests__/batch-decrypt-as.test.ts`
- Modify: `packages/sdk/src/token/readonly-token.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/sdk/src/token/__tests__/batch-decrypt-as.test.ts`:

```ts
import { describe, expect, vi } from "vitest";
import { test, createMockSigner } from "../../test-fixtures";
import { ReadonlyToken } from "../readonly-token";
import { MemoryStorage } from "../memory-storage";
import type { Address } from "viem";
import type { Handle } from "../../relayer/relayer-sdk.types";

const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const HANDLE_A = ("0x" + "a1".repeat(32)) as Handle;
const HANDLE_B = ("0x" + "b2".repeat(32)) as Handle;

function mockCreds(contractAddresses: Address[]) {
  return {
    allow: vi.fn().mockResolvedValue({
      publicKey: "0xpub",
      privateKey: "0xpriv",
      signature: "0xsig",
      contractAddresses,
      startTimestamp: Math.floor(Date.now() / 1000),
      durationDays: 1,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    }),
  };
}

describe("ReadonlyToken.batchDecryptBalancesAs", () => {
  test("decrypts balances for multiple tokens using delegated credentials", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    vi.mocked(signer.readContract).mockResolvedValueOnce(HANDLE_A).mockResolvedValueOnce(HANDLE_B);

    vi.mocked(relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockResolvedValueOnce({ [HANDLE_B]: 200n });

    const tokenA = new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: TOKEN_A,
    });
    const tokenB = new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: TOKEN_B,
    });

    const mockCredentials = mockCreds([TOKEN_A, TOKEN_B]);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA, tokenB], {
      delegatorAddress: DELEGATOR,
      credentials: mockCredentials as never,
    });

    expect(balances.get(TOKEN_A)).toBe(100n);
    expect(balances.get(TOKEN_B)).toBe(200n);
    expect(mockCredentials.allow).toHaveBeenCalledOnce();
    // allow() is called with rest args: (delegator, tokenA, tokenB)
    expect(mockCredentials.allow).toHaveBeenCalledWith(DELEGATOR, TOKEN_A, TOKEN_B);
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
  });

  test("returns empty map for empty token list", async () => {
    const result = await ReadonlyToken.batchDecryptBalancesAs([], {
      delegatorAddress: DELEGATOR,
      credentials: {} as never,
    });
    expect(result.size).toBe(0);
  });

  test("returns 0n for zero handles without calling relayer", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const ZERO = ("0x" + "00".repeat(32)) as Handle;

    vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO);

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });
    const mockCredentials = { allow: vi.fn() };

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
      credentials: mockCredentials as never,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(mockCredentials.allow).not.toHaveBeenCalled();
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("calls onError callback when decryption fails for a token", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    vi.mocked(signer.readContract).mockResolvedValueOnce(HANDLE_A);
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });
    const mockCredentials = mockCreds([TOKEN_A]);
    const onError = vi.fn().mockReturnValue(0n);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
      credentials: mockCredentials as never,
      onError,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(onError).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/sdk/src/token/__tests__/batch-decrypt-as.test.ts`
Expected: FAIL — `batchDecryptBalancesAs` is not a function

- [ ] **Step 3: Implement `batchDecryptBalancesAs`**

Add to `packages/sdk/src/token/readonly-token.ts` after `batchDecryptBalances` (around line ~330). Add the `BatchDecryptAsOptions` interface next to `BatchDecryptOptions`:

```ts
/** Options for {@link ReadonlyToken.batchDecryptBalancesAs}. */
export interface BatchDecryptAsOptions {
  /** The address of the account that delegated decryption rights. */
  delegatorAddress: Address;
  /** Credential manager for caching delegated credentials. */
  credentials: {
    allow(
      delegatorAddress: Address,
      ...contractAddresses: Address[]
    ): Promise<import("./token.types").DelegatedStoredCredentials>;
  };
  /** Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. */
  handles?: Handle[];
  /** Balance owner address. Defaults to the delegator address. */
  owner?: Address;
  /** Called when decryption fails for a single token. Return a fallback bigint. */
  onError?: (error: Error, address: Address) => bigint;
  /** Maximum number of concurrent decrypt calls. Default: Infinity. */
  maxConcurrency?: number;
}
```

Implement the static method following the same pattern as `batchDecryptBalances`:

1. Early return for empty tokens
2. Resolve owner (default to `delegatorAddress`)
3. Fetch handles in parallel via `readConfidentialBalanceOf(owner)`
4. Parallel cache lookups via `loadCachedBalance`
5. `credentials.allow(delegatorAddress, ...uncachedAddresses)` — rest args, NOT array
6. Parallel `relayer.delegatedUserDecrypt()` per token, bounded by `maxConcurrency` via `pLimit`
7. Cache results via `saveCachedBalance`, collect errors

The key difference from `batchDecryptBalances` is using `relayer.delegatedUserDecrypt` with `creds.delegatorAddress` and `creds.delegateAddress` from the returned `DelegatedStoredCredentials`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/sdk/src/token/__tests__/batch-decrypt-as.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Run all SDK tests to check for regressions**

Run: `npx vitest run --project sdk --project react-sdk`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts packages/sdk/src/token/__tests__/batch-decrypt-as.test.ts
git commit -m "feat: add ReadonlyToken.batchDecryptBalancesAs for batch delegated decryption"
```

---

## Chunk 3: Query Options + React Hooks + Exports

### Task 6: `batchDecryptBalancesAsMutationOptions` query factory

**Files:**

- Create: `packages/sdk/src/query/batch-decrypt-balances-as.ts`
- Modify: `packages/sdk/src/query/index.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Create query factory**

Create `packages/sdk/src/query/batch-decrypt-balances-as.ts`:

```ts
import type { ReadonlyToken, BatchDecryptAsOptions } from "../token/readonly-token";
import type { Address } from "viem";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link batchDecryptBalancesAsMutationOptions}. */
export type BatchDecryptBalancesAsParams = BatchDecryptAsOptions;

export function batchDecryptBalancesAsMutationOptions(
  tokens: ReadonlyToken[],
): MutationFactoryOptions<
  readonly ["zama.batchDecryptBalancesAs"],
  BatchDecryptBalancesAsParams,
  Map<Address, bigint>
> {
  return {
    mutationKey: ["zama.batchDecryptBalancesAs"] as const,
    mutationFn: async (params) => ReadonlyToken.batchDecryptBalancesAs(tokens, params),
  };
}
```

- [ ] **Step 2: Export from query index**

Add to `packages/sdk/src/query/index.ts`:

```ts
export {
  batchDecryptBalancesAsMutationOptions,
  type BatchDecryptBalancesAsParams,
} from "./batch-decrypt-balances-as";
```

Also add `BatchDecryptAsOptions` to the existing re-export from `readonly-token`:

```ts
export type {
  BatchDecryptOptions,
  BatchDecryptAsOptions,
  ReadonlyTokenConfig,
} from "../token/readonly-token";
```

- [ ] **Step 3: Export `BatchDecryptAsOptions` from SDK root**

In `packages/sdk/src/index.ts`, update the readonly-token export line:

```ts
export type {
  ReadonlyTokenConfig,
  BatchDecryptOptions,
  BatchDecryptAsOptions,
} from "./token/readonly-token";
```

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/query/batch-decrypt-balances-as.ts packages/sdk/src/query/index.ts packages/sdk/src/index.ts
git commit -m "feat: add batchDecryptBalancesAsMutationOptions query factory"
```

### Task 7: `useBatchDecryptBalancesAs` React hook + re-exports

**Files:**

- Create: `packages/react-sdk/src/token/use-batch-decrypt-balances-as.ts`
- Modify: `packages/react-sdk/src/index.ts`

- [ ] **Step 1: Create the hook**

Create `packages/react-sdk/src/token/use-batch-decrypt-balances-as.ts`.

Note: Since `batchDecryptBalancesAs` is a static method on `ReadonlyToken` and requires `ReadonlyToken[]` instances, and React hooks can't call `useReadonlyToken` in a loop, this hook accepts `ReadonlyToken[]` directly. This differs from single-token hooks that accept `Address` — it's the correct pattern for batch operations since the caller needs to construct tokens anyway (batch operations are power-user features).

````ts
"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { ReadonlyToken, type Address, type BatchDecryptAsOptions } from "@zama-fhe/sdk";

/**
 * Batch decrypt confidential balances as a delegate across multiple tokens.
 *
 * @param tokens - ReadonlyToken instances to decrypt balances for.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const batchDecryptAs = useBatchDecryptBalancesAs(tokens);
 * batchDecryptAs.mutate({
 *   delegatorAddress: "0xDelegator",
 *   credentials: delegatedCredsManager,
 * });
 * // batchDecryptAs.data => Map { "0xTokenA" => 100n, "0xTokenB" => 200n }
 * ```
 */
export function useBatchDecryptBalancesAs(
  tokens: ReadonlyToken[],
  options?: UseMutationOptions<Map<Address, bigint>, Error, BatchDecryptAsOptions>,
) {
  return useMutation<Map<Address, bigint>, Error, BatchDecryptAsOptions>({
    mutationKey: ["zama.batchDecryptBalancesAs", ...tokens.map((t) => t.address)] as const,
    mutationFn: async (params) => ReadonlyToken.batchDecryptBalancesAs(tokens, params),
    ...options,
  });
}
````

- [ ] **Step 2: Export from react-sdk index + add re-exports**

Add to `packages/react-sdk/src/index.ts` near the other token hooks (around line 234):

```ts
export { useBatchDecryptBalancesAs } from "./token/use-batch-decrypt-balances-as";
```

Also add re-exports for the new SDK types (near existing re-exports from `@zama-fhe/sdk`):

```ts
export { DelegatedCredentialsManager } from "@zama-fhe/sdk";
export type {
  DelegatedCredentialsManagerConfig,
  DelegatedStoredCredentials,
  BatchDecryptAsOptions,
} from "@zama-fhe/sdk";
```

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/token/use-batch-decrypt-balances-as.ts packages/react-sdk/src/index.ts
git commit -m "feat: add useBatchDecryptBalancesAs React hook + re-exports"
```

### Task 8: Update API reports

**Files:**

- Run: API extractor for sdk and react-sdk

- [ ] **Step 1: Regenerate API reports**

Run: `npx turbo run api:extract` (or whatever the project uses for API reports)

Check if `packages/sdk/api-report.md` and `packages/react-sdk/api-report.md` are updated.

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/api-report.md packages/react-sdk/api-report.md
git commit -m "chore: update API reports for batch delegated decryption"
```

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --project sdk --project react-sdk`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run linter**

Run: `npx turbo run lint`
Expected: No errors

- [ ] **Step 3: Run type check**

Run: `npx turbo run typecheck`
Expected: No errors
