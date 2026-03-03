# Plan: CleartextFhevmInstance SDK Core

## Unit ID
`sdk-cleartext-implementation`

## Overview

Port `CleartextMockFhevm` from `packages/playwright/fixtures/cleartext-mock/` into a first-class
SDK citizen at `packages/sdk/src/relayer/cleartext/`, implementing the `RelayerSDK` interface and
exported via a new `@zama-fhe/sdk/cleartext` entrypoint.

## TDD Assessment

**TDD applies.** This unit creates new public API surface — a new `@zama-fhe/sdk/cleartext`
entrypoint with the `CleartextFhevmInstance` class implementing the `RelayerSDK` interface.
While the helper files (handle.ts, eip712.ts, encrypted-input.ts) are mostly verbatim copies,
the main class is a rewrite with a new constructor pattern and adapted method signatures.
The test files exist but require significant adaptation (class rename, positional → object params,
removed methods, broken test assertions). Writing/fixing tests before the implementation class
ensures correct behavior contracts.

---

## Step-by-step Plan

### Step 1: Create directory and port verbatim source files

Create `packages/sdk/src/relayer/cleartext/` and copy the files that need no or minimal changes:

**Files to create:**

1. **`packages/sdk/src/relayer/cleartext/handle.ts`** — verbatim copy from
   `packages/playwright/fixtures/cleartext-mock/handle.ts`
   - No changes needed. Imports from `./constants` (same relative path).

2. **`packages/sdk/src/relayer/cleartext/eip712.ts`** — verbatim copy from
   `packages/playwright/fixtures/cleartext-mock/eip712.ts`
   - No changes needed.

3. **`packages/sdk/src/relayer/cleartext/types.ts`** — port with rename:
   - Copy from `packages/playwright/fixtures/cleartext-mock/types.ts`
   - Rename `CleartextMockConfig` → `CleartextFhevmConfig` (interface name and all references)
   - Same shape, same fields.

4. **`packages/sdk/src/relayer/cleartext/constants.ts`** — port with deletions:
   - Copy from `packages/playwright/fixtures/cleartext-mock/constants.ts`
   - **Remove** `import deployments from "../../../../hardhat/deployments.json" with { type: "json" };`
   - **Remove** the entire `FHEVM_ADDRESSES` export block
   - Keep everything else verbatim: `VERIFYING_CONTRACTS`, `GATEWAY_CHAIN_ID`,
     `MOCK_INPUT_SIGNER_PK`, `MOCK_KMS_SIGNER_PK`, `FheType` enum, `FHE_BIT_WIDTHS`,
     `HANDLE_VERSION`, `PREHANDLE_MASK`

5. **`packages/sdk/src/relayer/cleartext/encrypted-input.ts`** — port with type rename:
   - Copy from `packages/playwright/fixtures/cleartext-mock/encrypted-input.ts`
   - Change `import type { CleartextMockConfig } from "./types"` →
     `import type { CleartextFhevmConfig } from "./types"`
   - Change constructor parameter type `CleartextMockConfig` → `CleartextFhevmConfig`
   - Change `readonly #config: CleartextMockConfig` → `readonly #config: CleartextFhevmConfig`

**Verification:** `pnpm --filter @zama-fhe/sdk run typecheck` should compile these files
(no consumers yet, but no red squiggles).

---

### Step 2: Port and fix test files (tests first — TDD)

Create `packages/sdk/src/relayer/cleartext/__tests__/` and port the unit tests.
Tests run before the main class is implemented.

**Files to create:**

1. **`packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts`** — port with hardcoded addresses:
   ```typescript
   import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "../constants";
   import type { CleartextFhevmConfig } from "../types";

   // Deterministic Hardhat deployment addresses (from FHEVMHostAddresses.sol).
   // Hardcoded here instead of importing from deployments.json so the SDK
   // unit tests have no dependency on the hardhat package.
   const TEST_FHEVM_ADDRESSES = {
     acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
     executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
     inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
     kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
   } as const;

   export const USER_ADDRESS = "0x1000000000000000000000000000000000000001";
   export const CONTRACT_ADDRESS = "0x2000000000000000000000000000000000000002";

   export const CLEAR_TEXT_MOCK_CONFIG: CleartextFhevmConfig = {
     chainId: 31_337n,
     gatewayChainId: GATEWAY_CHAIN_ID,
     aclAddress: TEST_FHEVM_ADDRESSES.acl,
     executorProxyAddress: TEST_FHEVM_ADDRESSES.executor,
     inputVerifierContractAddress: TEST_FHEVM_ADDRESSES.inputVerifier,
     kmsContractAddress: TEST_FHEVM_ADDRESSES.kmsVerifier,
     verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
     verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
   };

   // Re-export for backward compat
   export { TEST_FHEVM_ADDRESSES };
   ```

2. **`packages/sdk/src/relayer/cleartext/__tests__/handle.test.ts`** — port with fixture change:
   - Copy from playwright `__tests__/handle.test.ts`
   - Replace `import { FHEVM_ADDRESSES, ... } from "../constants"` →
     `import { FheType, HANDLE_VERSION } from "../constants"`
     and `import { TEST_FHEVM_ADDRESSES } from "./fixtures"`
   - Replace all `FHEVM_ADDRESSES.acl` → `TEST_FHEVM_ADDRESSES.acl`
   - Test vectors remain identical (same addresses).

3. **`packages/sdk/src/relayer/cleartext/__tests__/encrypted-input.test.ts`** — port verbatim:
   - Copy from playwright `__tests__/encrypted-input.test.ts`
   - Import paths already use relative `../encrypted-input` and `./fixtures` — same structure.
   - The `CLEAR_TEXT_MOCK_CONFIG` fixture type changes from `CleartextMockConfig` to
     `CleartextFhevmConfig` but the fixture file handles that.

4. **`packages/sdk/src/relayer/cleartext/__tests__/eip712.test.ts`** — port with **fix**:
   - Copy from playwright `__tests__/eip712.test.ts`
   - **CRITICAL FIX**: The first test asserts fields `blobHash` and `handlesList` but the actual
     `INPUT_VERIFICATION_EIP712` has `ctHandles`, `userAddress`, `contractAddress`,
     `contractChainId`, `extraData`. The test assertion is wrong against the current source code.
   - Fix the test to assert the actual fields:
     ```typescript
     it("INPUT_VERIFICATION_EIP712 typehash matches spec definition", () => {
       const expected = ethers.id(
         "CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)",
       );
       const encoded = ethers.TypedDataEncoder.from(
         INPUT_VERIFICATION_EIP712.types,
       ).encodeType("CiphertextVerification");

       expect(ethers.id(encoded)).toBe(expected);
       expect(INPUT_VERIFICATION_EIP712.domain(10901, ethers.ZeroAddress).name).toBe(
         "InputVerification",
       );
       expect(INPUT_VERIFICATION_EIP712.types.CiphertextVerification.map((f) => f.name)).toEqual([
         "ctHandles",
         "userAddress",
         "contractAddress",
         "contractChainId",
         "extraData",
       ]);
     });
     ```

5. **`packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts`** — new test
   file, rewritten from playwright `__tests__/index.test.ts`:

   **Changes from original `index.test.ts`:**
   - Remove the `CLEARTEXT_EXECUTOR_BYTECODE` import (file doesn't exist)
   - Remove the `"create patches the implementation code"` test (no more patching behavior)
   - Replace `CleartextMockFhevm.create(provider, config)` → `new CleartextFhevmInstance(provider, config)` (sync)
   - Import `ACL_ABI, EXECUTOR_ABI` from `../cleartext-fhevm-instance` (not `../index`)
   - Import `CLEAR_TEXT_MOCK_CONFIG` fixtures — use `TEST_FHEVM_ADDRESSES` instead of `FHEVM_ADDRESSES`
   - Replace positional `userDecrypt()` calls with object-param `UserDecryptParams`:
     ```typescript
     await fhevm.userDecrypt({
       handles: [handleA, handleB],
       contractAddress: CONTRACT_ADDRESS,
       signedContractAddresses: [CONTRACT_ADDRESS],
       privateKey: "0x" + "11".repeat(32),
       publicKey: "0x" + "22".repeat(32),
       signature: "0x" + "33".repeat(65),
       signerAddress: USER_ADDRESS,
       startTimestamp: 1,
       durationDays: 1,
     })
     ```
   - Remove `createEncryptedInput` test — replaced by `encrypt()` method test
   - **Fix `abiEncodedClearValues` assertion**: The implementation concatenates raw 32-byte
     zero-padded values (NOT ABI-encoded `uint256[]`). Change assertion from
     `ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]"], ...)` to:
     ```typescript
     // Raw 32-byte concatenation (not ABI-encoded array)
     const expected = ethers.hexlify(
       ethers.concat([
         ethers.zeroPadValue(ethers.toBeHex(42n), 32),
         ethers.zeroPadValue(ethers.toBeHex(99n), 32),
       ]),
     );
     expect(result.abiEncodedClearValues).toBe(expected);
     ```
   - Add new tests for `RelayerSDK`-specific methods:
     - `generateKeypair()` returns Promise<FHEKeypair>
     - `createEIP712()` returns Promise<EIP712TypedData>
     - `encrypt()` accepts `EncryptParams` and returns `EncryptResult`
     - `getPublicKey()` returns null
     - `getPublicParams()` returns null
     - `terminate()` is a no-op (no throw)
     - `createDelegatedUserDecryptEIP712()` throws "Not implemented in cleartext mode"
     - `delegatedUserDecrypt()` throws "Not implemented in cleartext mode"
     - `requestZKProofVerification()` throws "Not implemented in cleartext mode"

   **Mock provider** — keep `createMockProvider()` from original but:
   - Remove `eth_getStorageAt` and `hardhat_setCode` handlers
   - Use `TEST_FHEVM_ADDRESSES` instead of `FHEVM_ADDRESSES`

**Verification:** Tests should fail at this point (class doesn't exist yet) — this is expected TDD red phase.

---

### Step 3: Create `cleartext-fhevm-instance.ts` (main class)

Create `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts`:

```typescript
import { ethers } from "ethers";
import type { RelayerSDK } from "../relayer-sdk";
import type {
  EncryptParams,
  EncryptResult,
  UserDecryptParams,
  PublicDecryptResult,
  FHEKeypair,
  EIP712TypedData,
  DelegatedUserDecryptParams,
  KmsDelegatedUserDecryptEIP712Type,
  InputProofBytesType,
  ZKProofLike,
  Address,
} from "../relayer-sdk.types";
import { CleartextEncryptedInput } from "./encrypted-input";
import { MOCK_KMS_SIGNER_PK } from "./constants";
import { KMS_DECRYPTION_EIP712, USER_DECRYPT_EIP712 } from "./eip712";
import type { CleartextFhevmConfig } from "./types";

export const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
] as const;

export const EXECUTOR_ABI = [
  "function plaintexts(bytes32 handle) view returns (uint256)",
] as const;

type RpcLike = { send(method: string, params: unknown[]): Promise<unknown> };
```

**Constructor** — sync, public:
```typescript
constructor(provider: RpcLike, config: CleartextFhevmConfig) {
  this.#provider = provider;
  this.#config = config;
}
```

**Method implementations:**

| Method | Signature | Implementation |
|--------|-----------|---------------|
| `generateKeypair()` | `async (): Promise<FHEKeypair>` | Wrap existing sync logic in `Promise.resolve()` |
| `createEIP712()` | `async (pk, addrs, ts, days?): Promise<EIP712TypedData>` | Wrap existing sync logic in `Promise.resolve()` |
| `encrypt()` | `async (params: EncryptParams): Promise<EncryptResult>` | Create `CleartextEncryptedInput`, call `add64(v)` for each value (TODO: assumes Uint64), call `.encrypt()` |
| `userDecrypt()` | `async (params: UserDecryptParams): Promise<Record<string, bigint>>` | Map `params.handles` + `params.contractAddress` → `handleContractPairs`, then existing ACL + executor logic |
| `publicDecrypt()` | `async (handles): Promise<PublicDecryptResult>` | Unchanged from current `CleartextMockFhevm.publicDecrypt` |
| `createDelegatedUserDecryptEIP712()` | full signature | `throw new Error("Not implemented in cleartext mode")` |
| `delegatedUserDecrypt()` | full signature | `throw new Error("Not implemented in cleartext mode")` |
| `requestZKProofVerification()` | full signature | `throw new Error("Not implemented in cleartext mode")` |
| `getPublicKey()` | `async (): Promise<... \| null>` | `return null` |
| `getPublicParams()` | `async (bits): Promise<... \| null>` | `return null` |
| `terminate()` | `(): void` | No-op (empty body) |

**Private helpers** — port verbatim from `CleartextMockFhevm`:
- `#persistAllowed(handle, account): Promise<boolean>`
- `#isAllowedForDecryption(handle): Promise<boolean>`
- `#readPlaintext(handle): Promise<bigint>`
- `#ethCall(to, data): Promise<string>`

**Key adaptation — `userDecrypt`:**
```typescript
async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
  const handleContractPairs = params.handles.map((handle) => ({
    handle,
    contractAddress: params.contractAddress,
  }));
  const normalizedSignerAddress = ethers.getAddress(params.signerAddress);
  // ... then same logic as current CleartextMockFhevm.userDecrypt
  // using handleContractPairs and normalizedSignerAddress
}
```

**Key adaptation — `encrypt`:**
```typescript
async encrypt(params: EncryptParams): Promise<EncryptResult> {
  const input = new CleartextEncryptedInput(
    params.contractAddress,
    params.userAddress,
    this.#config,
  );
  // TODO: Assumes all values are Uint64. Support FheType-aware encryption
  // once EncryptParams carries type information per value.
  for (const value of params.values) {
    input.add64(value);
  }
  return input.encrypt();
}
```

**Verification:** `pnpm --filter @zama-fhe/sdk run typecheck` passes.

---

### Step 4: Create barrel export `index.ts`

Create `packages/sdk/src/relayer/cleartext/index.ts`:

```typescript
export { CleartextFhevmInstance, ACL_ABI, EXECUTOR_ABI } from "./cleartext-fhevm-instance";
export { CleartextEncryptedInput } from "./encrypted-input";
export type { CleartextFhevmConfig } from "./types";
export { FheType, FHE_BIT_WIDTHS } from "./constants";
```

**Verification:** Barrel compiles, all symbols accessible.

---

### Step 5: Update build config — `tsup.config.ts`

Edit `packages/sdk/tsup.config.ts`, add to the first config object's `entry`:

```typescript
entry: {
  index: "src/index.ts",
  "viem/index": "src/viem/index.ts",
  "ethers/index": "src/ethers/index.ts",
  "node/index": "src/node/index.ts",
  "relayer-sdk.node-worker": "src/worker/relayer-sdk.node-worker.ts",
  "cleartext/index": "src/relayer/cleartext/index.ts",  // NEW
},
```

**Verification:** `pnpm --filter @zama-fhe/sdk run build` succeeds.
Check that `dist/cleartext/index.js` and `dist/cleartext/index.d.ts` exist.

---

### Step 6: Update `package.json` exports

Edit `packages/sdk/package.json`, add to `"exports"`:

```json
"./cleartext": {
  "types": "./dist/cleartext/index.d.ts",
  "import": "./dist/cleartext/index.js"
}
```

**Verification:** The export map is valid. `pnpm --filter @zama-fhe/sdk run build` still passes.

---

### Step 7: Handle Vitest alias path mismatch

The root `vitest.config.ts` alias maps `@zama-fhe/sdk/cleartext` → `packages/sdk/src/cleartext`.
But the actual files are at `packages/sdk/src/relayer/cleartext/`.

**Solution:** The unit tests use **relative imports** (`../cleartext-fhevm-instance`, `../constants`, etc.)
so they don't need the `@zama-fhe/sdk/cleartext` alias. No shim file needed for unit tests.

If external tests (in playwright or react-sdk) later need `@zama-fhe/sdk/cleartext`,
a re-export shim at `packages/sdk/src/cleartext/index.ts` can be added in a follow-up unit.
For now, this is out of scope — unit tests work with relative imports.

---

### Step 8: Run all tests and typecheck

```bash
# Typecheck
pnpm --filter @zama-fhe/sdk run typecheck

# Unit tests (auto-discovered by root vitest.config.ts)
pnpm vitest run packages/sdk/src/relayer/cleartext/__tests__/

# Build
pnpm --filter @zama-fhe/sdk run build

# Verify dist outputs
ls -la packages/sdk/dist/cleartext/index.js packages/sdk/dist/cleartext/index.d.ts
```

---

## Files to Create

| File | Source | Changes |
|------|--------|---------|
| `packages/sdk/src/relayer/cleartext/handle.ts` | Verbatim copy | None |
| `packages/sdk/src/relayer/cleartext/eip712.ts` | Verbatim copy | None |
| `packages/sdk/src/relayer/cleartext/types.ts` | Port | `CleartextMockConfig` → `CleartextFhevmConfig` |
| `packages/sdk/src/relayer/cleartext/constants.ts` | Port | Remove `deployments.json` import + `FHEVM_ADDRESSES` |
| `packages/sdk/src/relayer/cleartext/encrypted-input.ts` | Port | `CleartextMockConfig` → `CleartextFhevmConfig` |
| `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` | **New** | Full RelayerSDK implementation |
| `packages/sdk/src/relayer/cleartext/index.ts` | **New** | Barrel exports |
| `packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts` | Port | Hardcode FHEVM addresses, type rename |
| `packages/sdk/src/relayer/cleartext/__tests__/handle.test.ts` | Port | Use `TEST_FHEVM_ADDRESSES` from fixtures |
| `packages/sdk/src/relayer/cleartext/__tests__/encrypted-input.test.ts` | Port | Minimal (fixture type auto-updated) |
| `packages/sdk/src/relayer/cleartext/__tests__/eip712.test.ts` | Port | **Fix** wrong field assertions |
| `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts` | **Rewrite** | New file from `index.test.ts` |

## Files to Modify

| File | Change |
|------|--------|
| `packages/sdk/tsup.config.ts` | Add `"cleartext/index"` entry |
| `packages/sdk/package.json` | Add `"./cleartext"` export condition |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `encrypt()` Uint64 assumption | All values treated as `Uint64` regardless of actual bit-width | Leave explicit TODO comment; works for current E2E tests |
| `eip712.test.ts` field mismatch | Test asserts wrong field names (`blobHash`, `handlesList`) | Fix test to match actual implementation fields |
| `abiEncodedClearValues` format | Original test decodes as `uint256[]` but impl uses raw concat | Fix test assertion to match raw 32-byte concat format |
| `CLEARTEXT_EXECUTOR_BYTECODE` missing import | `index.test.ts` imports from `../bytecode` which doesn't exist | Remove this import and the `create patches` test entirely |
| `Address` type from relayer-sdk.types | Uses `@zama-fhe/relayer-sdk/bundle` re-export | Type is just `string` — cleartext mode doesn't need the full type; use `string` where needed |
| `EIP712TypedData.domain.chainId` is `number` | But `CleartextFhevmConfig.chainId` is `bigint` | Cast with `Number()` in `createEIP712` (chain IDs fit in JS number range) |
| `PublicDecryptResult.decryptionProof` type is `Address` (hex string) | Implementation returns hex string — compatible | No action needed |
| Test precomputed vectors depend on specific ACL address | Hardcoded in test fixtures | Use exact same address `0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D` |

---

## Acceptance Criteria Verification

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | `cleartext-fhevm-instance.ts` compiles, satisfies RelayerSDK | `pnpm --filter @zama-fhe/sdk run typecheck` — zero errors |
| 2 | Build emits `dist/cleartext/index.js` + `.d.ts` | `pnpm --filter @zama-fhe/sdk run build && ls dist/cleartext/` |
| 3 | package.json has `./cleartext` export | `jq '.exports["./cleartext"]' packages/sdk/package.json` |
| 4 | constants.ts has no hardhat/deployments.json reference | `grep -r "deployments" packages/sdk/src/relayer/cleartext/constants.ts` returns empty |
| 5 | Constructor is synchronous | No `static create()` or `async` constructor in source |
| 6 | Core methods implemented and don't throw unconditionally | Unit tests pass for all 5 methods |
| 7 | Delegated methods throw "Not implemented" | Unit tests assert specific error message |
| 8 | `getPublicKey` → null, `getPublicParams` → null, `terminate` → no-op | Unit tests |
| 9 | All unit tests pass | `pnpm vitest run packages/sdk/src/relayer/cleartext/__tests__/` |
| 10 | Typecheck passes | `pnpm --filter @zama-fhe/sdk run typecheck` |
