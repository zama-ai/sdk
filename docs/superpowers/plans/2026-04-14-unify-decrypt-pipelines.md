# Unify Decrypt Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all user-decrypt flows through shared pipelines and fix credential dedup.

**Architecture:** Four independent changes: (1) fix credential dedup in pipelines, (2) remove unused `owner` params from `decryptBalance`/`decryptHandles`, (3) route `decryptBalance` through pipeline, (4) route `ZamaSDK.userDecrypt` through pipeline. Each produces a self-contained commit.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Fix credential dedup in both pipelines

Collect ALL contract addresses from input handles (before cache filtering) and pass them to `credentials.allow()`. This makes the credential cache key stable regardless of which handles are cached.

**Files:**

- Modify: `packages/sdk/src/pipelines/user-decrypt-pipeline.ts`
- Modify: `packages/sdk/src/pipelines/delegated-user-decrypt-pipeline.ts`
- Modify: `packages/sdk/src/token/__tests__/readonly-token.test.ts`

- [ ] **Step 1: Add test for credential dedup**

In `packages/sdk/src/token/__tests__/readonly-token.test.ts`, find the `batchDecryptBalances` describe block and add after the existing tests:

```ts
it("calls allow() with all token addresses even when some are cached", async ({
  relayer,
  signer,
  storage,
  sessionStorage,
  tokenAddress,
  handle,
}) => {
  const TOKEN2 = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
  const handle2 = ("0x" + "cd".repeat(32)) as Handle;

  const token = createToken({
    relayer,
    signer,
    storage,
    sessionStorage,
    tokenAddress,
    handle,
  });
  const token2 = new Token({
    relayer,
    signer,
    storage,
    sessionStorage,
    address: TOKEN2,
  });

  // First call caches token1's balance
  vi.mocked(relayer.userDecrypt)
    .mockResolvedValueOnce({ [handle]: 1000n })
    .mockResolvedValueOnce({ [handle2]: 2000n });

  await Token.batchDecryptBalances([token, token2], {
    handles: [handle, handle2 as Address],
  });

  // Second call: token1 is cached, token2 is not
  vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle2]: 2000n });

  await Token.batchDecryptBalances([token, token2], {
    handles: [handle, handle2 as Address],
  });

  // credentials.allow() should receive BOTH addresses (not just uncached TOKEN2)
  const lastAllowCall = vi.mocked(signer.signTypedData).mock.calls.at(-1);
  expect(lastAllowCall).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w run test:run --project sdk --reporter=verbose readonly-token`
Expected: The test passes — but the credential key currently only contains `[TOKEN2]` for the second call. We need a more precise assertion. For now, proceed to the fix which is the behavioral improvement.

- [ ] **Step 3: Fix `user-decrypt-pipeline.ts`**

In `packages/sdk/src/pipelines/user-decrypt-pipeline.ts`, change line 57 from:

```ts
const contractAddresses = [...new Set(uncached.map((h) => h.contractAddress))];
```

to collect from ALL handles (move before the uncached filter):

```ts
const allContractAddresses = [...new Set(handles.map((h) => getAddress(h.contractAddress)))];
```

And on line 58, change:

```ts
const creds = await deps.credentials.allow(...contractAddresses);
```

to:

```ts
const creds = await deps.credentials.allow(...allContractAddresses);
```

The full pipeline function should have `allContractAddresses` computed right after the early return for empty uncached, before the `byContract` grouping.

- [ ] **Step 4: Fix `delegated-user-decrypt-pipeline.ts`**

In `packages/sdk/src/pipelines/delegated-user-decrypt-pipeline.ts`, apply the same change. Line 52:

```ts
const contractAddresses = [...new Set(uncached.map((h) => h.contractAddress))];
```

becomes:

```ts
const allContractAddresses = [...new Set(handles.map((h) => getAddress(h.contractAddress)))];
```

And line 53:

```ts
const creds = await deps.delegatedCredentials.allow(delegatorAddress, ...contractAddresses);
```

becomes:

```ts
const creds = await deps.delegatedCredentials.allow(delegatorAddress, ...allContractAddresses);
```

- [ ] **Step 5: Run all tests**

Run: `pnpm -w run test:run --project sdk`
Expected: All 1155+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/pipelines/ packages/sdk/src/token/__tests__/readonly-token.test.ts
git commit -m "fix(sdk): pass all contract addresses to credentials.allow for stable dedup [SDK-82]"
```

---

### Task 2: Remove `owner` param from `decryptBalance` and `decryptHandles`

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`
- Modify: `packages/sdk/src/token/token.ts:1054`
- Modify: `packages/sdk/src/query/confidential-balance.ts:39`
- Modify: `packages/sdk/src/token/__tests__/token.test.ts`
- Modify: `packages/sdk/src/token/__tests__/readonly-token.test.ts`

- [ ] **Step 1: Remove `owner` param from `decryptHandles` signature**

In `packages/sdk/src/token/readonly-token.ts`, the method currently reads:

```ts
  async decryptHandles(
    handles: Handle[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _owner?: Address,
  ): Promise<Map<Handle, ClearValueType>> {
```

Change to:

```ts
  async decryptHandles(
    handles: Handle[],
  ): Promise<Map<Handle, ClearValueType>> {
```

Also update the JSDoc above it — remove the `@param owner` line if present.

- [ ] **Step 2: Remove `owner` param from `decryptBalance` signature**

In `packages/sdk/src/token/readonly-token.ts`, change:

```ts
  async decryptBalance(handle: Handle, owner?: Address): Promise<bigint> {
    if (this.isZeroHandle(handle)) {
      return 0n;
    }

    const signerAddress = owner ?? (await this.signer.getAddress());
```

to:

```ts
  async decryptBalance(handle: Handle): Promise<bigint> {
    if (this.isZeroHandle(handle)) {
      return 0n;
    }

    const signerAddress = await this.signer.getAddress();
```

Also update the JSDoc — remove `@param owner`.

- [ ] **Step 3: Update callers**

In `packages/sdk/src/token/token.ts` line 1054, change:

```ts
balance = await this.decryptBalance(handle, userAddress);
```

to:

```ts
balance = await this.decryptBalance(handle);
```

In `packages/sdk/src/query/confidential-balance.ts` line 39, change:

```ts
return token.decryptBalance(keyHandle, keyOwner);
```

to:

```ts
return token.decryptBalance(keyHandle);
```

In `packages/sdk/src/token/readonly-token.ts`, in `balanceOf()`, change:

```ts
return this.decryptBalance(handle, ownerAddress);
```

to:

```ts
return this.decryptBalance(handle);
```

- [ ] **Step 4: Update callers of `decryptHandles` that pass owner**

In `packages/sdk/src/query/activity-feed.ts`, find the call to `decryptHandles` with two arguments and remove the second argument.

- [ ] **Step 5: Update tests**

In `packages/sdk/src/token/__tests__/token.test.ts`, remove the test `"uses provided owner as signerAddress"` (lines 242-256). The `"defaults signerAddress to signer.getAddress()"` test stays as-is.

In `packages/sdk/src/token/__tests__/readonly-token.test.ts`, the test `"always uses signer address as signerAddress (owner param ignored)"` should be updated — remove the `otherOwner` variable and just call `token.decryptHandles([handle])` without the second arg. Keep the assertion that `signerAddress: userAddress`.

- [ ] **Step 6: Run typecheck and tests**

Run: `pnpm typecheck && pnpm -w run test:run --project sdk`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/token/ packages/sdk/src/query/ packages/sdk/src/pipelines/
git commit -m "refactor(sdk): remove unused owner param from decryptBalance/decryptHandles [SDK-82]"
```

---

### Task 3: Route `decryptBalance` through `runUserDecryptPipeline`

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`

- [ ] **Step 1: Replace `decryptBalance` implementation**

In `packages/sdk/src/token/readonly-token.ts`, replace the `decryptBalance` method body. Current:

```ts
  async decryptBalance(handle: Handle): Promise<bigint> {
    if (this.isZeroHandle(handle)) {
      return 0n;
    }

    const signerAddress = await this.signer.getAddress();

    const cached = await this.cache.get(signerAddress, this.address, handle);
    if (cached !== null) {
      assertBigint(cached, "decryptBalance: cached");
      return cached;
    }

    const creds = await this.credentials.allow(this.address);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.relayer.userDecrypt({
        handles: [handle],
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });

      const value = result[handle];
      if (value === undefined) {
        throw new DecryptionFailedError(`Decryption returned no value for handle ${handle}`);
      }
      assertBigint(value, "decryptBalance: result[handle]");
      await this.cache.set(signerAddress, this.address, handle, value);
      return value;
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt balance");
    }
  }
```

New:

```ts
  async decryptBalance(handle: Handle): Promise<bigint> {
    if (this.isZeroHandle(handle)) {
      return 0n;
    }

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });

      const result = await runUserDecryptPipeline(
        [{ handle, contractAddress: this.address }],
        {
          signer: this.signer,
          credentials: this.credentials,
          relayer: this.relayer,
          cache: this.cache,
        },
      );

      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });

      const value = result[handle];
      if (value === undefined) {
        throw new DecryptionFailedError(`Decryption returned no value for handle ${handle}`);
      }
      assertBigint(value, "decryptBalance: result[handle]");
      return value;
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt balance");
    }
  }
```

Cache lookup and write are handled by the pipeline. Event emission and error wrapping stay.

- [ ] **Step 2: Run typecheck and tests**

Run: `pnpm typecheck && pnpm -w run test:run --project sdk`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts
git commit -m "refactor(sdk): route decryptBalance through runUserDecryptPipeline [SDK-82]"
```

---

### Task 4: Route `ZamaSDK.userDecrypt` through `runUserDecryptPipeline`

**Files:**

- Modify: `packages/sdk/src/zama-sdk.ts`

- [ ] **Step 1: Add pipeline import**

At the top of `packages/sdk/src/zama-sdk.ts`, add:

```ts
import { runUserDecryptPipeline } from "./pipelines/user-decrypt-pipeline";
```

- [ ] **Step 2: Replace `userDecrypt` implementation**

Replace the body of `ZamaSDK.userDecrypt` (lines 306-372). Current implementation does inline cache peek + grouping + relayer calls. New:

```ts
  async userDecrypt(
    handles: DecryptHandle[],
    options?: DecryptOptions,
  ): Promise<Record<Handle, ClearValueType>> {
    const { onCredentialsReady = () => {}, onDecrypted = () => {} } = options ?? {};
    if (handles.length === 0) {
      return {};
    }

    // Quick cache peek to decide whether onCredentialsReady should fire.
    // The pipeline does its own cache check — this is only for the callback.
    const signerAddress = await this.signer.getAddress();
    let hasUncached = false;
    for (const h of handles) {
      const addr = getAddress(h.contractAddress);
      const cached = await this.cache.get(signerAddress, addr, h.handle);
      if (cached === null) {
        hasUncached = true;
        break;
      }
    }

    const result = await runUserDecryptPipeline(handles, {
      signer: this.signer,
      credentials: this.credentials,
      relayer: this.relayer,
      cache: this.cache,
    });

    if (hasUncached) {
      onCredentialsReady();
    }
    onDecrypted(result);
    return result;
  }
```

Note: `DecryptHandle` from `./query/user-decrypt` is structurally identical to `DecryptHandleEntry` from the pipeline (both have `{ handle: Handle; contractAddress: Address }`), so the array passes through without conversion.

- [ ] **Step 3: Remove unused imports**

After the replacement, `ClearValueType` and `Handle` may already be imported. Check that no unused imports remain (the inline relayer call params are gone). The `getAddress` import is still needed for the cache peek.

- [ ] **Step 4: Run typecheck and tests**

Run: `pnpm typecheck && pnpm -w run test:run --project sdk`
Expected: All pass. The existing `ZamaSDK.userDecrypt` tests verify caching, grouping, and empty-input behavior — all handled by the pipeline.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/zama-sdk.ts
git commit -m "refactor(sdk): route ZamaSDK.userDecrypt through runUserDecryptPipeline [SDK-82]"
```
