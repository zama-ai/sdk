# Plan: Playwright Fixture Migration to SDK Cleartext

**Unit**: `playwright-fixture-migration`
**Date**: 2026-03-03

---

## Work Type Assessment

**This is mechanical refactoring** — no new features, no bug fixes, no API surface changes.

The 5 Playwright route handlers stay structurally identical. The CDN intercept is untouched.
We are simply:
1. Swapping a local import (`./cleartext-mock`) for a workspace package import (`@zama-fhe/sdk/cleartext`)
2. Replacing an async factory call with a sync constructor
3. Adapting method call signatures to match the `RelayerSDK` interface (builder→params, positional→object, sync→async)
4. Deleting dead code (the now-unused `cleartext-mock/` directory)

The compiler (TypeScript typecheck) enforces correctness of all signature changes.
Existing E2E tests cover the observable behavior.

## TDD Applicability

**TDD does not apply.**

Justification:
- No new code paths, features, or public API surface
- Observable behavior is unchanged — same 5 HTTP routes, same request/response shapes
- The SDK class already has its own unit tests in `packages/sdk/src/relayer/cleartext/__tests__/`
- The old `cleartext-mock/__tests__/` tests were already ported to the SDK
- TypeScript typecheck + existing E2E tests are the correct verification

---

## Step-by-Step Changes

### Step 1: Add `@zama-fhe/sdk` dependency to Playwright package

**File**: `packages/playwright/package.json`

Add `"@zama-fhe/sdk": "workspace:*"` to `dependencies`:

```diff
  "dependencies": {
    "@playwright/test": "^1.58.2",
+   "@zama-fhe/sdk": "workspace:*",
    "ethers": "^6.16.0",
    "viem": "^2.46.3"
  },
```

Then run `pnpm install` from the repo root.

### Step 2: Update imports in `fhevm.ts`

**File**: `packages/playwright/fixtures/fhevm.ts`

Replace:
```typescript
import { CleartextMockFhevm } from "./cleartext-mock";
import { FHEVM_ADDRESSES, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "./cleartext-mock/constants";
```

With:
```typescript
import { CleartextFhevmInstance, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "@zama-fhe/sdk/cleartext";

const FHEVM_ADDRESSES = {
  acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
} as const;
```

### Step 3: Replace factory with constructor

**File**: `packages/playwright/fixtures/fhevm.ts`

Replace the `createMockFhevmInstance` function:

```typescript
// BEFORE: async function with await CleartextMockFhevm.create(...)
// AFTER: sync function with new CleartextFhevmInstance(...)
function createMockFhevmInstance(rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  return new CleartextFhevmInstance(provider, {
    chainId: BigInt(hardhat.id),
    gatewayChainId: GATEWAY_CHAIN_ID,
    aclAddress: FHEVM_ADDRESSES.acl,
    executorProxyAddress: FHEVM_ADDRESSES.executor,
    inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifier,
    kmsContractAddress: FHEVM_ADDRESSES.kmsVerifier,
    verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
    verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
  });
}
```

In `mockRelayerSdk`, change `const fhevm = await createMockFhevmInstance(rpcUrl)` → `const fhevm = createMockFhevmInstance(rpcUrl)` (drop `await`).

### Step 4: Update `/generateKeypair` route

**File**: `packages/playwright/fixtures/fhevm.ts`

Add `await` since `generateKeypair()` is now async:
```typescript
const result = await fhevm.generateKeypair();
```

### Step 5: Update `/createEIP712` route

**File**: `packages/playwright/fixtures/fhevm.ts`

Add `await` since `createEIP712()` is now async:
```typescript
const result = await fhevm.createEIP712(
  body.publicKey,
  body.contractAddresses,
  body.startTimestamp,
  body.durationDays,
);
```

### Step 6: Update `/encrypt` route

**File**: `packages/playwright/fixtures/fhevm.ts`

Replace builder pattern with single `encrypt()` call:
```typescript
// BEFORE:
// const input = fhevm.createEncryptedInput(body.contractAddress, body.userAddress);
// for (const value of body.values) { input.add64(BigInt(value)); }
// const encrypted = await input.encrypt();

// AFTER:
const encrypted = await fhevm.encrypt({
  values: body.values.map((v: string | number | bigint) => BigInt(v)),
  contractAddress: body.contractAddress,
  userAddress: body.userAddress,
});
```

Response serialization stays the same.

### Step 7: Update `/userDecrypt` route

**File**: `packages/playwright/fixtures/fhevm.ts`

Replace positional args with single-object `UserDecryptParams`:
```typescript
// BEFORE: fhevm.userDecrypt(handleContractPairs, pk, pubk, sig, addrs, signer, ts, days)
// AFTER:
const result = await fhevm.userDecrypt({
  handles: body.handles,
  contractAddress: body.contractAddress,
  signedContractAddresses: body.signedContractAddresses,
  privateKey: body.privateKey,
  publicKey: body.publicKey,
  signature: body.signature,
  signerAddress: body.signerAddress,
  startTimestamp: body.startTimestamp,
  durationDays: body.durationDays,
});
```

Remove the `handleContractPairs` mapping (no longer needed).

### Step 8: Verify `/publicDecrypt` route — no changes needed

The `fhevm.publicDecrypt(body.handles)` call signature is the same in the SDK. No changes required.

### Step 9: Delete `cleartext-mock/` directory

```bash
rm -rf packages/playwright/fixtures/cleartext-mock/
```

Files deleted:
- `index.ts` — old `CleartextMockFhevm` class
- `constants.ts` — old constants
- `types.ts` — old `CleartextMockConfig` type
- `encrypted-input.ts` — old builder
- `eip712.ts` — old EIP-712 definitions
- `handle.ts` — old handle computation
- `__tests__/` — old unit tests (already ported to SDK)

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/playwright/package.json` | Add `@zama-fhe/sdk: "workspace:*"` to dependencies |
| `packages/playwright/fixtures/fhevm.ts` | Rewrite imports, constructor, and 4 route handlers |

## Files to Delete

| Path | Reason |
|------|--------|
| `packages/playwright/fixtures/cleartext-mock/` (entire directory) | Replaced by `@zama-fhe/sdk/cleartext` |

## Files to Create

None.

---

## Verification

### 1. TypeScript typecheck
```bash
pnpm --filter @zama-fhe/playwright run typecheck
```
Note: No `typecheck` script exists in the Playwright package.json yet. We need to either:
- Add `"typecheck": "tsc --noEmit"` to `packages/playwright/package.json` scripts, or
- Run `npx tsc --noEmit` from the `packages/playwright` directory.

If a `typecheck` script doesn't exist, add it.

### 2. No imports from `./cleartext-mock`
```bash
grep -r "cleartext-mock" packages/playwright/
# Expected: no results
```

### 3. `cleartext-mock/` directory does not exist
```bash
test ! -d packages/playwright/fixtures/cleartext-mock && echo "PASS" || echo "FAIL"
```

### 4. All 5 routes present in fhevm.ts
```bash
grep -c "baseURL\}/generateKeypair\|baseURL\}/createEIP712\|baseURL\}/encrypt\|baseURL\}/userDecrypt\|baseURL\}/publicDecrypt" packages/playwright/fixtures/fhevm.ts
# Expected: 5
```

### 5. CDN intercept present
```bash
grep "cdn.zama.org/relayer-sdk" packages/playwright/fixtures/fhevm.ts
# Expected: match
```

### 6. E2E tests (requires running Hardhat node)
```bash
pnpm --filter @zama-fhe/playwright run e2e:test
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `@zama-fhe/sdk` not built yet → import fails | Run `pnpm --filter @zama-fhe/sdk run build` before typecheck |
| SDK `./cleartext` export path resolution fails | Verify `packages/sdk/package.json` exports map includes `./cleartext` (✓ already confirmed) |
| `FHEVM_ADDRESSES` values wrong | Addresses are deterministic Hardhat deployments, confirmed matching `TEST_FHEVM_ADDRESSES` in SDK test fixtures |
| E2E tests fail due to method signature mismatch | TypeScript typecheck catches these at compile time; the SDK's own unit tests also verify the methods |
| Missing `typecheck` script in Playwright package | Add it as part of the migration |

---

## Acceptance Criteria Mapping

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | No import from `./cleartext-mock` | grep check (Step 2) |
| 2 | `cleartext-mock/` directory deleted | filesystem check (Step 9) |
| 3 | Sync `new CleartextFhevmInstance(provider, config)` constructor | Code review (Step 3) |
| 4 | All 5 route handlers present | grep check (5 routes) |
| 5 | CDN intercept unchanged | grep check |
| 6 | `pnpm --filter @zama-fhe/playwright run typecheck` passes | Typecheck verification |
| 7 | E2E tests pass | E2E test run |
