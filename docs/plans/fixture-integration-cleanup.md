# Plan: Fixture Integration and Dependency Cleanup

**Unit**: fixture-integration-cleanup
**Category**: medium
**Date**: 2026-03-03

---

## Work Type Assessment

This is **mechanical cleanup / refactoring**. It:
- Replaces one implementation (`MockFhevmInstance`) with a drop-in replacement (`CleartextMockFhevm`)
- Removes dead workaround code (retry loops, mutex, block-mining)
- Removes unused dependencies
- Does **not** change observable behavior — the route handlers still respond identically to the same HTTP requests
- The compiler + existing E2E tests enforce correctness

**TDD does not apply.** Rationale: No new behavior is introduced. The existing Playwright E2E tests already exercise all five route handlers end-to-end. The changes are purely mechanical: swap import, simplify call sites, remove dead code, remove deps. TypeCheck + existing E2E tests are the verification strategy.

---

## Step-by-Step Changes

### Step 1: Modify `packages/playwright/fixtures/fhevm.ts` — Replace import and factory

**File**: `packages/playwright/fixtures/fhevm.ts`

Replace line 1:
```ts
// BEFORE
import { MockFhevmInstance } from "@fhevm/mock-utils";
// AFTER
import { CleartextMockFhevm } from "./cleartext-mock";
import { FHEVM_ADDRESSES, VERIFYING_CONTRACTS, GATEWAY_CHAIN_ID } from "./cleartext-mock/constants";
```

Replace `createMockFhevmInstance` function (lines 11–32):
```ts
// BEFORE: createMockFhevmInstance(chainId: number, rpcUrl: string) with 4-arg MockFhevmInstance.create
// AFTER: createMockFhevmInstance(rpcUrl: string) with 2-arg CleartextMockFhevm.create
async function createMockFhevmInstance(rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  const fhevm = await CleartextMockFhevm.create(provider, {
    chainId: BigInt(hardhat.id),
    gatewayChainId: GATEWAY_CHAIN_ID,
    aclAddress: FHEVM_ADDRESSES.acl,
    executorProxyAddress: FHEVM_ADDRESSES.executor,
    inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifier,
    kmsContractAddress: FHEVM_ADDRESSES.kmsVerifier,
    verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
    verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
  });
  return fhevm;
}
```

Update the call site (line 38):
```ts
// BEFORE
const fhevm = await createMockFhevmInstance(hardhat.id, rpcUrl);
// AFTER
const fhevm = await createMockFhevmInstance(rpcUrl);
```

### Step 2: Remove `decryptLock` mutex from `fhevm.ts`

Delete line 40–42 (the mutex comment and declaration):
```ts
// DELETE
let decryptLock: Promise<void> = Promise.resolve();
```

### Step 3: Simplify `/userDecrypt` handler in `fhevm.ts`

Replace lines 88–179 (the entire handler) with a direct `await` call:
```ts
await page.route(`${baseURL}/userDecrypt`, async (route) => {
  const body = route.request().postDataJSON();
  const handleContractPairs = body.handles.map((handle: string) => ({
    handle,
    contractAddress: body.contractAddress,
  }));
  try {
    const result = await fhevm.userDecrypt(
      handleContractPairs,
      body.privateKey,
      body.publicKey,
      body.signature,
      body.signedContractAddresses,
      body.signerAddress,
      body.startTimestamp,
      body.durationDays,
    );
    const serialized: Record<string, string> = {};
    for (const [key, value] of Object.entries(result)) {
      serialized[key] = String(value);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(serialized),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: message }),
    });
  }
});
```

Removed:
- Mutex acquire/release (`decryptLock`, `resolve`)
- `try/finally` wrapper for mutex
- `callDecrypt` thunk
- `MAX_ACL_RETRIES` constant + retry for-loop
- `provider.send("hardhat_mine", ...)` calls
- Block filter / ACL error matching

### Step 4: Simplify `/publicDecrypt` handler in `fhevm.ts`

Replace lines 181–256 (the entire handler) with a direct `await` call:
```ts
await page.route(`${baseURL}/publicDecrypt`, async (route) => {
  const body = route.request().postDataJSON();
  try {
    const result = await fhevm.publicDecrypt(body.handles);
    const clearValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.clearValues)) {
      clearValues[key] = String(value);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        clearValues,
        abiEncodedClearValues: result.abiEncodedClearValues,
        decryptionProof: result.decryptionProof,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: message }),
    });
  }
});
```

Removed:
- Mutex acquire/release
- `callDecrypt` thunk
- `MAX_RETRIES` constant + retry for-loop
- `provider.send("hardhat_mine", ...)` calls
- Block filter / coprocessor error matching

### Step 5: Remove unused `provider` variable from `mockRelayerSdk`

After removing all `provider.send("hardhat_mine", ...)` calls, check if `provider` is still used in the function body. It is **NOT** — `createMockFhevmInstance` now creates its own `provider` internally.

Delete line 36:
```ts
// DELETE
const provider = new JsonRpcProvider(rpcUrl);
```

The `rpcUrl` variable is still needed (passed to `createMockFhevmInstance`).

### Step 6: Modify `packages/playwright/fixtures/test.ts` — Remove post-revert block mining

Remove lines 128–132 (the mine call and its stale comment):
```ts
// DELETE these lines:
    await viemClient.revert({ id });
    // Mine blocks so the chain advances past the Hardhat coprocessor's stale
    // BlockLogCursor — evm_revert doesn't reset the coprocessor cursor, so
    // without this it skips blocks where new handles are created in later tests.
    await viemClient.mine({ blocks: 100 });
```

Keep `await viemClient.revert({ id });` — only remove the mine call and its comment (lines 129–132).

Also update the comment on lines 123–125 since route handlers no longer mine blocks:
```ts
// BEFORE
// Wait for in-flight route handlers (userDecrypt/publicDecrypt) to finish
// before reverting — they mine blocks on the Hardhat node, and concurrent
// mining + revert causes chain state to leak between tests.
// AFTER
// Wait for in-flight route handlers to finish before reverting.
```

### Step 7: Remove `@fhevm/mock-utils` from `packages/playwright/package.json`

Remove `"@fhevm/mock-utils": "0.4.2"` from `dependencies`.

### Step 8: Remove `@fhevm/mock-utils` from root `package.json`

Remove `"@fhevm/mock-utils": "0.4.2"` from `devDependencies`.

**DO NOT remove `@zama-fhe/relayer-sdk`** — it is imported by production source files in `packages/sdk/src/`.

### Step 9: Run `pnpm install` to update lockfile

```bash
pnpm install
```

### Step 10: Verify

1. **TypeCheck**: `pnpm run typecheck` — must pass with zero errors
2. **Build**: `pnpm run build` — must succeed
3. **E2E tests**: `pnpm run e2e:test` — existing tests must pass

---

## Files Modified

| File | Change |
|------|--------|
| `packages/playwright/fixtures/fhevm.ts` | Replace import, factory, remove mutex/retry loops, simplify handlers |
| `packages/playwright/fixtures/test.ts` | Remove post-revert mine call + update comment |
| `packages/playwright/package.json` | Remove `@fhevm/mock-utils` dependency |
| `package.json` (root) | Remove `@fhevm/mock-utils` devDependency |
| `pnpm-lock.yaml` | Updated by `pnpm install` |

## Files Created

None.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `CleartextMockFhevm` errors are not retried — if ACL state is stale, decrypt fails immediately | By design: `CleartextMockFhevm` reads on-chain state via `eth_call`, which always sees the latest block. No coprocessor cursor issue exists. |
| `chainId` type mismatch (`number` vs `bigint`) | Explicitly wrap with `BigInt(hardhat.id)` — verified against `CleartextMockConfig.chainId: bigint` |
| `kmsContractAddress` differs from old config | Old: `0xbE0E...311A`. New: `0x901F...b030` (from `constants.ts`). This is intentional — the new `CleartextMockFhevm` uses the correct kmsVerifier address. |
| Removing the mutex causes race conditions | No: the mutex only existed to serialize `hardhat_mine` calls that would interfere with each other. `CleartextMockFhevm` makes read-only `eth_call` RPCs that don't modify chain state. |
| Post-revert mine removal breaks test isolation | No: the mine was needed for the old coprocessor's `BlockLogCursor`. `CleartextMockFhevm` reads current state via `eth_call` — no cursor to advance. |

---

## Acceptance Criteria Verification

| # | Criterion | How Verified |
|---|-----------|-------------|
| 1 | fhevm.ts contains no import of `@fhevm/mock-utils` or `@zama-fhe/relayer-sdk` | grep check after edit |
| 2 | fhevm.ts imports `CleartextMockFhevm` from `./cleartext-mock` | visual inspection |
| 3 | No `decryptLock`, retry loops, or block-mining workarounds in fhevm.ts | grep check |
| 4 | All five route handlers use direct `await` with no retry | visual inspection |
| 5 | test.ts has no post-revert mine call | visual inspection |
| 6 | `@fhevm/mock-utils` absent from `packages/playwright/package.json` | grep check |
| 7 | `@fhevm/mock-utils` absent from root `package.json` devDeps; `@zama-fhe/relayer-sdk` retained | grep check |
| 8 | `pnpm install` succeeds | run command |
| 9 | `pnpm run typecheck` passes | run command |
| 10 | `pnpm run build` succeeds | run command |
| 11 | E2E tests pass | `pnpm run e2e:test` |
